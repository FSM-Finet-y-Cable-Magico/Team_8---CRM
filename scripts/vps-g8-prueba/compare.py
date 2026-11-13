#!/usr/bin/env python3
"""Compare a running container with the container Compose would create.

Read-only and sanitized: environment VALUES are never printed, only key names and
a status. Inputs are JSON files produced by `docker inspect`, `docker image inspect`
and `docker compose config --format json`.

Usage:
  compare.py --running running.json --old-image old.json --new-image new.json \
             --config config.json --service backend --expect-image <tag> \
             [--require-mount /app/generated]
Exit code 0 = only allowed differences (image), 1 = a blocking difference.
"""
import argparse
import json
import sys

ANY_HOST = {"", "0.0.0.0", "::", None}


def load(path):
    with open(path, encoding="utf-8") as handle:
        data = json.load(handle)
    return data[0] if isinstance(data, list) else data


def is_anonymous(volume_name):
    """Docker names anonymous volumes with 64 hex characters; named volumes are not reattached."""
    return bool(volume_name) and len(volume_name) == 64 and all(ch in "0123456789abcdef" for ch in volume_name)


def env_map(entries):
    result = {}
    for entry in entries or []:
        key, _, value = entry.partition("=")
        result[key] = value
    return result


def main():
    parser = argparse.ArgumentParser()
    for name in ("running", "old-image", "new-image", "config", "service", "expect-image"):
        parser.add_argument("--" + name, required=True)
    parser.add_argument("--require-mount", action="append", default=[])
    args = parser.parse_args()

    running = load(args.running)
    old_image = load(args.old_image)
    new_image = load(args.new_image)
    config = load(args.config)
    service = config["services"][args.service]
    failures = []

    def report(status, area, detail):
        print(f"{status:<6} {area:<9} {detail}")
        if status == "FAIL":
            failures.append(area + ": " + detail)

    # Image: the only change expected when an override is applied.
    planned_image = service.get("image")
    report("OK" if planned_image == args.expect_image else "FAIL", "image",
           f"actual={running['Config'].get('Image')} plan={planned_image} esperado={args.expect_image}")

    # Effective environment: new image ENV overridden by Compose environment (env_file is
    # already merged by `compose config`), compared with what the container runs today.
    compose_env = service.get("environment") or {}
    if isinstance(compose_env, list):
        compose_env = env_map(compose_env)
    unresolved = sorted(key for key, value in compose_env.items() if value is None)
    for key in unresolved:
        report("FAIL", "env", f"{key} sin valor resuelto en compose config")
    planned_env = env_map(new_image["Config"].get("Env"))
    planned_env.update({key: str(value) for key, value in compose_env.items() if value is not None})
    running_env = env_map(running["Config"].get("Env"))
    old_image_env = env_map(old_image["Config"].get("Env"))
    new_image_env = env_map(new_image["Config"].get("Env"))
    same = 0
    for key in sorted(set(planned_env) | set(running_env)):
        if key in compose_env:
            if running_env.get(key) == planned_env.get(key):
                same += 1
            else:
                report("FAIL", "env", f"{key} difiere entre el contenedor actual y la configuración Compose")
        elif key in old_image_env or key in new_image_env:
            # Provided by the image itself (PATH, NODE_VERSION, NGINX_VERSION...).
            if running_env.get(key) == planned_env.get(key):
                same += 1
            else:
                report("INFO", "env", f"{key} proviene de la imagen y cambia con ella")
        else:
            report("FAIL", "env", f"{key} existe en el contenedor actual pero no en la configuración Compose")
    report("OK", "env", f"{same} variables idénticas (valores no impresos)")

    # Mounts, including the persistent PDF volume.
    volumes_top = config.get("volumes") or {}
    planned_mounts = {}
    for mount in service.get("volumes") or []:
        kind = mount.get("type")
        source = mount.get("source")
        if kind == "volume" and source in volumes_top:
            source = (volumes_top[source] or {}).get("name") or source
        planned_mounts[mount.get("target")] = (kind, source, bool(mount.get("read_only")))
    for key in ("secrets", "configs"):
        for item in service.get(key) or []:
            target = item.get("target") or ("/run/secrets/" + item.get("source", "") if key == "secrets" else "/" + item.get("source", ""))
            planned_mounts[target] = (key[:-1], item.get("source"), True)
    running_mounts = {}
    for mount in running.get("Mounts") or []:
        source = mount.get("Name") if mount.get("Type") == "volume" else mount.get("Source")
        running_mounts[mount.get("Destination")] = (mount.get("Type"), source, not mount.get("RW", True))
    for target in sorted(set(planned_mounts) | set(running_mounts)):
        plan, actual = planned_mounts.get(target), running_mounts.get(target)
        if plan and actual:
            if plan[0] in ("secret", "config") and actual[0] == "bind":
                report("OK", "mount", f"{target} ({plan[0]})")
            elif plan[0] == actual[0] and plan[1] == actual[1] and plan[2] == actual[2]:
                report("OK", "mount", f"{target} {actual[0]}:{actual[1]}")
            else:
                report("FAIL", "mount", f"{target} actual={actual[0]}:{actual[1]} ro={actual[2]} plan={plan[0]}:{plan[1]} ro={plan[2]}")
        elif actual and actual[0] == "volume" and is_anonymous(actual[1]):
            # Anonymous volume: Compose reuses it on recreate unless -V/--renew-anon-volumes.
            report("WARN", "mount", f"{target} volumen anónimo {actual[1]}: se conserva solo si NO se usa -V")
        elif actual:
            report("FAIL", "mount", f"{target} existe hoy ({actual[0]}) y no está en la configuración")
        else:
            report("FAIL", "mount", f"{target} es nuevo en la configuración ({plan[0]}:{plan[1]})")
    for target in args.require_mount:
        if target not in running_mounts:
            report("FAIL", "mount", f"{target} NO es un montaje persistente hoy: recrear perdería sus archivos")
        elif target not in planned_mounts and not (running_mounts[target][0] == "volume" and is_anonymous(running_mounts[target][1])):
            report("FAIL", "mount", f"{target} no quedaría montado en el contenedor nuevo")

    # Networks.
    networks_top = config.get("networks") or {}
    planned_networks = set()
    for key in service.get("networks") or {"default": None}:
        planned_networks.add((networks_top.get(key) or {}).get("name") or key)
    running_networks = set((running.get("NetworkSettings") or {}).get("Networks") or {})
    report("OK" if planned_networks == running_networks else "FAIL", "network",
           f"actual={sorted(running_networks)} plan={sorted(planned_networks)}")

    # Published ports.
    def port_key(host_ip, published, target, protocol):
        return f"{'*' if host_ip in ANY_HOST else host_ip}:{published}->{target}/{protocol or 'tcp'}"
    planned_ports = {port_key(p.get("host_ip"), p.get("published"), p.get("target"), p.get("protocol"))
                     for p in service.get("ports") or [] if p.get("published")}
    running_ports = set()
    for container_port, bindings in ((running.get("HostConfig") or {}).get("PortBindings") or {}).items():
        target, _, protocol = container_port.partition("/")
        for binding in bindings or []:
            running_ports.add(port_key(binding.get("HostIp"), binding.get("HostPort"), target, protocol))
    report("OK" if planned_ports == running_ports else "FAIL", "ports", f"actual={sorted(running_ports)} plan={sorted(planned_ports)}")

    # Process definition and restart policy (values compared, not printed).
    def effective(field, compose_key):
        value = service.get(compose_key)
        return value if value not in (None, []) else new_image["Config"].get(field)
    for field, compose_key in (("Cmd", "command"), ("Entrypoint", "entrypoint"), ("WorkingDir", "working_dir"), ("User", "user")):
        current = running["Config"].get(field)
        planned = effective(field, compose_key)
        norm = lambda value: value or None
        report("OK" if norm(current) == norm(planned) else "FAIL", "process", f"{field} {'igual' if norm(current) == norm(planned) else 'DIFERENTE'}")
    restart_actual = ((running.get("HostConfig") or {}).get("RestartPolicy") or {}).get("Name") or "no"
    restart_plan = service.get("restart") or "no"
    report("OK" if restart_actual == restart_plan else "FAIL", "restart", f"actual={restart_actual} plan={restart_plan}")
    ports_old = set((old_image["Config"].get("ExposedPorts") or {}))
    ports_new = set((new_image["Config"].get("ExposedPorts") or {}))
    report("OK" if ports_old == ports_new else "FAIL", "image", f"ExposedPorts antigua={sorted(ports_old)} nueva={sorted(ports_new)}")
    health_old = bool(old_image["Config"].get("Healthcheck"))
    health_new = bool(new_image["Config"].get("Healthcheck"))
    report("OK" if health_old == health_new or service.get("healthcheck") else "WARN", "image", f"healthcheck de imagen antigua={health_old} nueva={health_new}")

    print("RESULTADO", "FAIL" if failures else "PASS", f"({len(failures)} bloqueos)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
