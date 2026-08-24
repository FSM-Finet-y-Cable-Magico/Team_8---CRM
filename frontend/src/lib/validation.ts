import { chileanMobilePattern, emailPattern, rutPattern } from '../constants';
import { normalizeRutInput } from './rut';

export type ProspectFormState = {
  rut: string;
  nombreCompleto: string;
  email: string;
  telefono: string;
  direccion: string;
  origenContacto: string;
};

export const emptyProspectForm: ProspectFormState = {
  rut: '',
  nombreCompleto: '',
  email: '',
  telefono: '',
  direccion: '',
  origenContacto: 'Formulario web',
};

export function validateProspectForm(form: ProspectFormState) {
  const rut = normalizeRutInput(form.rut);
  const nombreCompleto = form.nombreCompleto.trim();
  const email = form.email.trim().toLowerCase();
  const telefono = form.telefono.trim();
  const direccion = form.direccion.trim();
  const origenContacto = form.origenContacto.trim();

  if (!rutPattern.test(rut)) {
    return 'Ingresa el RUT con guion, por ejemplo 12345678-5.';
  }

  if (nombreCompleto.length < 5) {
    return 'Ingresa nombre y apellido del prospecto.';
  }

  if (email && !emailPattern.test(email)) {
    return 'Ingresa un correo valido, por ejemplo correo@ejemplo.cl.';
  }

  if (!chileanMobilePattern.test(telefono.replace(/\s/g, ''))) {
    return 'Ingresa un celular chileno, por ejemplo +56912345678.';
  }

  if (direccion.length < 8) {
    return 'Ingresa una direccion con calle, numero y comuna.';
  }

  if (!origenContacto) {
    return 'Selecciona el origen de contacto del prospecto.';
  }

  return '';
}

export function emptyServiceForm() {
  return {
    idContrato: '',
    idZonaPago: '',
    tipoServicio: 'Internet',
    estadoOperativo: 'Pendiente Instalacion',
    observaciones: '',
    tecnologia: '',
    velocidad: '',
    macAddress: '',
    puertoOlt: '',
    ipAsignada: '',
    observacionesTecnicas: '',
    cajaNap: '',
    numeroPoste: '',
    caracteristicasComerciales: '',
  };
}
