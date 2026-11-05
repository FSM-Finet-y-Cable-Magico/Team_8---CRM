import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboundMessage, TemplateKey } from './outbound-messaging.port';

export type MetaTemplate = { name:string; locale:string; parameters:string[] };
export type MetaCompany = { idEmpresa:number; alias:string; wabaId:string; phoneNumberId:string;
  templates:Partial<Record<TemplateKey,MetaTemplate>> };
const keys:TemplateKey[] = ['AVISO_PREVENTIVO','ULTIMO_AVISO_CORTE'];
const variables = ['customer_name','invoice_id','balance'];
export const validPhone = (phone:string) => /^\+[1-9]\d{7,14}$/.test(phone);

@Injectable()
export class MessagingConfig {
  readonly mode: 'disabled'|'mock'|'meta';
  readonly companies:MetaCompany[];
  readonly version:string;
  constructor(private readonly env:ConfigService) {
    const mode=env.get<string>('WHATSAPP_PROVIDER')?.trim() || 'disabled';
    if (!['disabled','mock','meta'].includes(mode)) throw new Error('WHATSAPP_PROVIDER_INVALID');
    this.mode=mode as typeof this.mode;
    this.version=env.get<string>('WHATSAPP_API_VERSION')?.trim() || '';
    const fail=():never=>{throw new Error('WHATSAPP_CONFIGURATION_INVALID');};
    let rows:unknown;
    try { rows=JSON.parse(env.get<string>('WHATSAPP_COMPANIES') || '[]'); } catch { fail(); }
    if (!Array.isArray(rows)) fail();
    const ids=new Set<number>(), aliases=new Set<string>(), phones=new Set<string>();
    this.companies=(rows as MetaCompany[]).map(row=>{
      if (!row || Object.keys(row).sort().join(',')!=='alias,idEmpresa,phoneNumberId,templates,wabaId' ||
          !Number.isSafeInteger(row.idEmpresa) || row.idEmpresa<1 || ids.has(row.idEmpresa) ||
          typeof row.alias!=='string' || !/^[A-Z][A-Z0-9_]{0,39}$/.test(row.alias) || aliases.has(row.alias) ||
          typeof row.phoneNumberId!=='string' || !/^[1-9]\d{4,29}$/.test(row.phoneNumberId) || phones.has(row.phoneNumberId) ||
          typeof row.wabaId!=='string' || !/^[1-9]\d{4,29}$/.test(row.wabaId) ||
          !row.templates || typeof row.templates!=='object' || Array.isArray(row.templates) ||
          Object.keys(row.templates).some(k=>!keys.includes(k as TemplateKey))) fail();
      for (const template of Object.values(row.templates)) {
        if (!template || Object.keys(template).sort().join(',')!=='locale,name,parameters' ||
            typeof template.name!=='string' || !/^[a-z0-9_]{1,512}$/.test(template.name) ||
            typeof template.locale!=='string' || !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(template.locale) ||
            !Array.isArray(template.parameters) || template.parameters.length>10 || template.parameters.some(k=>!variables.includes(k))) fail();
      }
      ids.add(row.idEmpresa);aliases.add(row.alias);phones.add(row.phoneNumberId);return row;
    });
    if (this.mode==='meta') {
      if (!/^v\d{1,3}\.0$/.test(this.version) || !this.companies.length) fail();
      for (const company of this.companies) this.credentials(company);
    }
  }
  company(id:number) { return this.companies.find(c=>c.idEmpresa===id); }
  credentials(company:MetaCompany) {
    const secret=(suffix:string)=>{
      const value=this.env.get<string>(`WHATSAPP_${company.alias}_${suffix}`)?.trim();
      if (!value || /\s/.test(value)) throw new Error('WHATSAPP_CREDENTIALS_MISSING');
      return value;
    };
    return {accessToken:secret('ACCESS_TOKEN'),appSecret:secret('APP_SECRET'),verifyToken:secret('VERIFY_TOKEN')};
  }
  template(id:number,key:TemplateKey) {
    const company=this.company(id),template=company?.templates[key];
    if (!company || !template) throw new Error('WHATSAPP_TEMPLATE_OR_COMPANY_MISSING');
    return {company,template};
  }
  validate(input:OutboundMessage) {
    if (!Number.isSafeInteger(input.idCliente) || input.idCliente<1 || !validPhone(input.destinationPhone) ||
        !/^[a-f0-9-]{36}$/.test(input.correlationId)) throw new Error('WHATSAPP_INPUT_INVALID');
    const selected=this.template(input.idEmpresa,input.templateKey);
    if (input.locale!==selected.template.locale || selected.template.parameters.some(k=>
      typeof input.variables[k]!=='string' || !input.variables[k].trim() || input.variables[k].length>1024 || /[\r\n\u0000]/.test(input.variables[k]))) {
      throw new Error('WHATSAPP_TEMPLATE_VARIABLES_INVALID');
    }
    return selected;
  }
}
