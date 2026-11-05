'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { verifyDatabase, assertTarget } = require('./p0-05-qa-isolation.cjs');

// No standalone command accepts a URL. Capabilities arrive only from the parent harness via IPC.
if (!process.send) throw new Error('QA worker requires parent IPC');
let prisma;
process.once('message', async input => {
  try {
    assertTarget(input.capability);
    const origin = new URL(input.g1Origin);
    assert.equal(origin.protocol, 'http:');
    assert.equal(origin.hostname, '127.0.0.1');
    assert.ok(origin.port);
    const fetchLocal = global.fetch;
    global.fetch = (url, options) => {
      assert.equal(new URL(String(url)).origin, origin.origin, 'External HTTP blocked by QA worker');
      return fetchLocal(url, { ...options, redirect: 'error' });
    };
    const { PrismaClient } = require('@prisma/client');
    prisma = new PrismaClient({ datasources: { db: { url: input.capability.url } } });
    const identity = await verifyDatabase(prisma, input.capability);
    const load = (file, name) => require(path.join(__dirname, '../backend/dist', file))[name];
    const { ConfigService } = require('@nestjs/config');
    const AuditService = load('audit/audit.service.js', 'AuditService');
    const Activation = load('g3-integration/installation-activation.service.js', 'InstallationActivationService');
    const G1 = load('g1-integration/g1-activation.service.js', 'G1ActivationService');
    const HttpG1 = load('g1-integration/http-g1-inventory.client.js', 'HttpG1InventoryClient');
    const Processor = load('g3-integration/g3-closure.processor.js', 'G3ClosureProcessor');
    const Installations = load('g3-integration/installation-integration.service.js', 'InstallationIntegrationService');
    const audit = new AuditService(prisma);
    const config = new ConfigService({ G1_API_URL: origin.origin, G1_API_KEY: input.g1Key,
      G1_INTEGRATION_ENABLED: 'true', G1_REQUEST_TIMEOUT_MS: '60000' });
    const g1 = new G1(prisma, audit, new HttpG1(config));
    const activation = new Activation();
    let activationCalls = 0;
    const activate = activation.activate.bind(activation);
    activation.activate = (...args) => { activationCalls++; return activate(...args); };
    const afterG1 = g1.afterG3Completion.bind(g1);
    g1.afterG3Completion = async (...args) => {
      if (input.action === 'crash-before-g1') process.exit(73);
      const result = await afterG1(...args);
      if (input.action === 'crash-after-g1') process.exit(74);
      return result;
    };
    const processor = new Processor(prisma, activation, audit, g1);
    const noG3 = new Proxy({}, { get: () => () => { throw new Error('G3 traffic forbidden in QA'); } });
    const installations = new Installations(prisma, audit, processor, noG3);
    process.send({ ready: true, backendPid: identity.pid, processPid: process.pid });
    process.once('message', async command => {
      if (command !== 'go') return process.exit(2);
      try {
        let result;
        if (input.action === 'retry') result = await g1.retry(input.id, input.user);
        else if (input.action === 'recover') result = await processor.recoverPostClosure(input.id);
        else if (input.action === 'reconcile') result = await installations.reconcile(input.id, input.user);
        else result = await processor.process(input.closure, 'WEBHOOK');
        // Report only technical states/counts; never return tracking snapshots, identities or credentials.
        process.send({ ok: true, activationCalls, state: result?.estadoIntegracion ?? null,
          postClosure: result?.postClosure ?? result?.result?.postClosure ?? null });
      } catch (error) {
        process.send({ ok: false, activationCalls, error: error.code ?? error.name, status: error.getStatus?.() ?? null });
      } finally {
        await prisma.$disconnect();
        process.disconnect();
      }
    });
  } catch (error) {
    process.send({ ok: false, error: error.code ?? error.name, setupFailed: true });
    if (prisma) await prisma.$disconnect();
    process.disconnect();
  }
});
