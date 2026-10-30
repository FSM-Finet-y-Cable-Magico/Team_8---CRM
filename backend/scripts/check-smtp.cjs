// Configuration is supplied by environment/Node --env-file, never by CLI passwords.
const { ConfigService } = require('@nestjs/config');
const { MailService, MailDeliveryError } = require('../dist/mail/mail.service');
async function main(args = process.argv.slice(2)) {
  let idEmpresa;
  if (args[0] === '--company') {
    idEmpresa = Number(args[1]);
    if (!Number.isSafeInteger(idEmpresa) || idEmpresa < 1) throw new Error('SMTP_COMPANY_INVALID');
    args = args.slice(2);
  }
  if (args.length && (args.length !== 2 || args[0] !== '--send-test-to')) throw new Error('USAGE: check-smtp.cjs [--company id] [--send-test-to address]');
  const service = new MailService(new ConfigService(process.env));
  service.onModuleInit();
  const verification = await service.verifyConnection(idEmpresa);
  console.log(JSON.stringify({ operation: 'smtp_verify_without_message', idEmpresa: idEmpresa ?? null, ...verification }));
  if (verification.status !== 'ready') return 1;
  if (args.length) {
    const result = await service.sendTest(args[1], idEmpresa);
    console.log(JSON.stringify({ operation: 'explicit_smtp_test', idEmpresa: idEmpresa ?? null, ...result, inboxDeliveryVerified: false }));
    return result.status === 'sent' ? 0 : 1;
  }
  return 0;
}
if (require.main === module) main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(JSON.stringify({ status: 'failed', code: error instanceof MailDeliveryError ? error.code : 'SMTP_CHECK_FAILED' }));
  process.exitCode = 1;
});
module.exports = { main };
