(() => {
'use strict';
const $ = id => document.getElementById(id);
const KEY = 'paraibaImoveisRecibosV3';
const SCHEMA_VERSION = 9;
const MIGRATION_BACKUP_KEY = KEY+'_antes_schema_'+SCHEMA_VERSION;
const MAX_AMOUNT = 999999999.99;
const PAGE_SIZE = 50;
const BACKUP_WARNING_DAYS = 7;
const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const operadores = ['Sandra Marcondes da Silva Alves','Ruziel Aparecido Alves Guilherme'];
const campos = ['amount','tenant','cpf','property','contractCode','dueDay','reference','payment','receiptDate','operator'];
const pagamentos = ['Dinheiro','Pix','Dinheiro/PIX','Transferência bancária','Boleto'];
const errorFields = ['amount','tenant','cpf','property','contractCode','dueDay','reference','payment','receiptDate','operator'];
const DOCUMENT_TYPES={receipt:{label:'Recibo',prefix:'REC'},declaration:{label:'Declaração',prefix:'DECL'},term:{label:'Termo',prefix:'TERMO'},contract:{label:'Contrato',prefix:'CONT'}};
const DOCUMENT_STATUSES=['draft','review','issued','sent','awaiting_signature','signed','rejected','canceled','archived'];
const GENERIC_TYPES=['declaration','term','contract'];
const CLAUSE_LIBRARY={payment:'O pagamento será realizado nos valores, prazos e condições estabelecidos neste instrumento, incidindo os encargos legais e contratuais em caso de atraso.',maintenance:'A parte responsável obriga-se a conservar o imóvel e seus acessórios, respondendo pelos danos que causar e devolvendo-os nas condições ajustadas, ressalvado o desgaste natural.',adjustment:'Os valores serão reajustados na periodicidade permitida pela legislação, de acordo com o índice indicado neste instrumento ou outro que legalmente o substitua.',termination:'O descumprimento das obrigações poderá ensejar a rescisão, observados os avisos, prazos e penalidades previstos neste instrumento e na legislação aplicável.',inspection:'As partes reconhecem a vistoria como referência para a conservação do imóvel e para a apuração de eventuais danos ao término da relação contratual.'};
const genericErrorIds=['docTitle','docDate','docCity','docDeclarant','docDeclarantDocument','docSubject','docBody','docPartyOne','docProperty','docObligations','docContractProperty','docCustomClauses'];
let recoveryRaw = '';
let storageCorrupted = false;
let migrationBackupCreated = false;
let state = lerEstado();
let activeRecord = null;
let pendingIssue = null;
let cancelTargetNumber = null;
let historyPage = 1;
let draftDirty = false;
let toastTimer;
let lastModalTrigger = null;
let currentView = 'new';
let editingContactId = '';
let currentDocumentType='receipt';
let activeGenericRecord=null;
let editingGenericDraftId='';
let genericDirty=false;

function statusRegistro(r){ return r && DOCUMENT_STATUSES.includes(r.status) ? r.status : 'issued'; }
function normalizarTexto(v){
  return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function normalizarCadastros(lista){
  const unicos=new Map();
  (Array.isArray(lista)?lista:[]).forEach(item=>{
    const cadastro=normalizarContato(item);
    if(!cadastro) return;
    const id=idContato(cadastro);
    unicos.set(id,{...cadastro,id});
  });
  return [...unicos.values()];
}
function gerarIdInstalacao(){
  if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function') return globalThis.crypto.randomUUID();
  return 'inst-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
}
function metaNormalizada(meta){
  const m=meta&&typeof meta==='object'?meta:{};
  return {
    schemaVersion:SCHEMA_VERSION,
    lastBackupAt:typeof m.lastBackupAt==='string'?m.lastBackupAt:'',
    installationId:typeof m.installationId==='string'&&m.installationId?m.installationId:gerarIdInstalacao(),
    defaultOperator:operadores.includes(m.defaultOperator)?m.defaultOperator:operadores[0]
  };
}
function normalizarRascunho(draft){
  if(!draft||typeof draft!=='object') return null;
  return {amount:String(draft.amount||'').slice(0,40),tenant:String(draft.tenant||'').slice(0,200),cpf:mascaraDocumento(draft.cpf||''),property:String(draft.property||'').slice(0,1500),contractCode:String(draft.contractCode||'').slice(0,60),dueDay:String(draft.dueDay||'').replace(/\D/g,'').slice(0,2),reference:/^\d{4}-(0[1-9]|1[0-2])$/.test(String(draft.reference||''))?String(draft.reference):'',payment:pagamentos.includes(draft.payment)?draft.payment:'Dinheiro',receiptDate:dataValida(String(draft.receiptDate||''))?String(draft.receiptDate):'',operator:operadores.includes(draft.operator)?draft.operator:operadores[0],savedTenantId:String(draft.savedTenantId||''),savedAt:typeof draft.savedAt==='string'?draft.savedAt:''};
}
function normalizarRegistroLocal(r){
  const base={...r,
    type:'receipt',templateVersion:Math.max(1,Number(r&&r.templateVersion)||1),letterhead:'institutional',
    status:statusRegistro(r),
    operator:operadores.includes(r&&r.operator)?r.operator:operadores[0],
    contractCode:String(r&&r.contractCode||'').slice(0,60),
    dueDay:Number.isInteger(Number(r&&r.dueDay))&&Number(r.dueDay)>=1&&Number(r.dueDay)<=31?Number(r.dueDay):0,
    canceledBy:operadores.includes(r&&r.canceledBy)?r.canceledBy:'',
    printCount:Math.max(0,Number(r&&r.printCount)||0),
    lastPrintedAt:typeof (r&&r.lastPrintedAt)==='string'?r.lastPrintedAt:''
  };
  base.fields=r&&r.fields&&typeof r.fields==='object'?{...r.fields}:{amount:base.amount,tenant:base.tenant,cpf:base.cpf,property:base.property,contractCode:base.contractCode,dueDay:base.dueDay,reference:base.reference,payment:base.payment,receiptDate:base.receiptDate,operator:base.operator};
  return base;
}
function idDocumento(){return 'doc-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);}
function normalizarCamposGenericos(fields){
  const f=fields&&typeof fields==='object'?fields:{},out={};
  for(const [k,v] of Object.entries(f)){
    if(k==='docFooterEnabled')out[k]=v===true||v==='true';
    else if(k==='selectedClauses')out[k]=Array.isArray(v)?v.filter(x=>CLAUSE_LIBRARY[x]):[];
    else out[k]=String(v??'').slice(0,k==='docCustomClauses'||k==='docBody'||k==='docObligations'?30000:4000);
  }
  return out;
}
function normalizarDocumentoGenerico(r,{draft=false}={}){
  if(!r||typeof r!=='object'||!GENERIC_TYPES.includes(r.type))return null;
  const status=draft?'draft':(DOCUMENT_STATUSES.includes(r.status)?r.status:'issued');
  const fields=normalizarCamposGenericos(r.fields);
  return {id:String(r.id||idDocumento()),type:r.type,templateVersion:Math.max(1,Number(r.templateVersion)||1),templateId:String(r.templateId||''),number:draft?'':String(r.number||''),year:Number(r.year)||Number(String(fields.docDate||hoje()).slice(0,4))||new Date().getFullYear(),status,letterhead:['none','first','repeat'].includes(r.letterhead)?r.letterhead:(['none','first','repeat'].includes(fields.docLetterhead)?fields.docLetterhead:'none'),footerEnabled:r.footerEnabled===true||fields.docFooterEnabled===true,fields,operator:operadores.includes(r.operator)?r.operator:(operadores.includes(fields.docOperator)?fields.docOperator:operadores[0]),createdAt:typeof r.createdAt==='string'?r.createdAt:'',updatedAt:typeof r.updatedAt==='string'?r.updatedAt:'',canceledAt:typeof r.canceledAt==='string'?r.canceledAt:'',canceledBy:operadores.includes(r.canceledBy)?r.canceledBy:'',cancelReason:String(r.cancelReason||'').slice(0,500),archivedAt:typeof r.archivedAt==='string'?r.archivedAt:'',printCount:Math.max(0,Number(r.printCount)||0),lastPrintedAt:typeof r.lastPrintedAt==='string'?r.lastPrintedAt:''};
}
function normalizarModelo(t){if(!t||typeof t!=='object'||!GENERIC_TYPES.includes(t.type))return null;const nome=String(t.name||'').trim().slice(0,120);if(!nome)return null;return {id:String(t.id||idDocumento()),name:nome,type:t.type,fields:normalizarCamposGenericos(t.fields),active:t.active!==false,createdAt:typeof t.createdAt==='string'?t.createdAt:new Date().toISOString(),updatedAt:typeof t.updatedAt==='string'?t.updatedAt:''};}
function normalizarModelos(lista){return (Array.isArray(lista)?lista:[]).map(normalizarModelo).filter(Boolean).slice(0,500);}
function lerEstado(){
  const raw=localStorage.getItem(KEY);
  if(!raw) return {counters:{},documentCounters:{},history:[],documents:[],draftDocuments:[],templates:[],contacts:[],draft:null,management:{},meta:metaNormalizada({})};
  try{
    const s=JSON.parse(raw);
    if(s && typeof s==='object'){
      const versaoAnterior=Number(s.meta&&s.meta.schemaVersion)||0;
      if(versaoAnterior<SCHEMA_VERSION){try{localStorage.setItem(MIGRATION_BACKUP_KEY,raw);migrationBackupCreated=true;}catch(e){}}
      return {
      counters:s.counters && typeof s.counters==='object'?s.counters:{},
      history:Array.isArray(s.history)?s.history.filter(r=>r&&typeof r==='object').map(normalizarRegistroLocal):[],
      documentCounters:s.documentCounters&&typeof s.documentCounters==='object'?s.documentCounters:{},
      documents:(Array.isArray(s.documents)?s.documents:[]).map(r=>normalizarDocumentoGenerico(r)).filter(Boolean),
      draftDocuments:(Array.isArray(s.draftDocuments)?s.draftDocuments:[]).map(r=>normalizarDocumentoGenerico(r,{draft:true})).filter(Boolean),
      templates:normalizarModelos(s.templates),contacts:normalizarCadastros(s.contacts),draft:normalizarRascunho(s.draft),
      management:s.management&&typeof s.management==='object'?s.management:{},
      meta:metaNormalizada(s.meta)
      };
    }
    recoveryRaw=raw;storageCorrupted=true;
  }catch(e){
    recoveryRaw=raw;storageCorrupted=true;
  }
  return {counters:{},documentCounters:{},history:[],documents:[],draftDocuments:[],templates:[],contacts:[],draft:null,management:{},meta:metaNormalizada({})};
}
function persistir(next){
  if(storageCorrupted){toast('Primeiro baixe os dados para recuperação ou confirme o início de um histórico vazio.',true);return false;}
  try{
    const normalized={
      counters:next.counters||{},
      documentCounters:next.documentCounters||{},
      history:Array.isArray(next.history)?next.history:[],
      documents:Array.isArray(next.documents)?next.documents:[],
      draftDocuments:Array.isArray(next.draftDocuments)?next.draftDocuments:[],
      templates:Array.isArray(next.templates)?next.templates:[],
      contacts:Array.isArray(next.contacts)?next.contacts:[],
      draft:next.draft===undefined?normalizarRascunho(state&&state.draft):normalizarRascunho(next.draft),
      management:next.management&&typeof next.management==='object'?next.management:(state&&state.management&&typeof state.management==='object'?state.management:{}),
      meta:metaNormalizada(next.meta||state.meta)
    };
    localStorage.setItem(KEY,JSON.stringify(normalized));
    state=normalized;
    return true;
  }catch(e){
    toast('Não foi possível salvar os dados neste navegador.',true);
    return false;
  }
}
function hoje(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
const mesAtual=()=>hoje().slice(0,7);
const anoSel=()=>Number(($('receiptDate').value||hoje()).slice(0,4));
const nro=(ano,seq)=>String(seq).padStart(2,'0')+'/'+ano;
function proxSeq(ano){
  const k=String(ano);
  const usados=state.history.filter(r=>typeof r.number==='string'&&r.number.endsWith('/'+k))
    .map(r=>Number(r.number.split('/')[0])).filter(Number.isInteger);
  const definido=Number(state.counters[k]);
  return Math.max(1,Number.isInteger(definido)?definido:1,Math.max(0,...usados)+1);
}
const nroAtivo=()=>activeRecord?activeRecord.number:nro(anoSel(),proxSeq(anoSel()));

function parseValor(v){
  let s=String(v||'').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if(/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(s)) s=s.replace(/\./g,'').replace(',','.');
  else if(!/^\d+\.\d{1,2}$/.test(s)) return NaN;
  const n=Number(s);
  return Number.isFinite(n)&&n>=0?n:NaN;
}
const moeda=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number.isFinite(Number(n))?Number(n):0);
const valorCampo=n=>new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n)||0);
function dataValida(s){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [a,m,d]=s.split('-').map(Number),dt=new Date(Date.UTC(a,m-1,d));
  return dt.getUTCFullYear()===a&&dt.getUTCMonth()+1===m&&dt.getUTCDate()===d;
}
const refValida=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function dataLonga(s){
  if(!dataValida(s)) return '—';
  const [a,m,d]=s.split('-').map(Number);
  return d+' de '+meses[m-1]+' de '+a;
}
function dataHora(s){
  if(!s) return 'Data de emissão não registrada';
  const d=new Date(s);
  return Number.isNaN(d.getTime())?'Data de emissão não registrada':
    new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d);
}
function refTexto(s){
  if(!refValida(s)) return 'mês/ano';
  const [a,m]=s.split('-').map(Number);
  return meses[m-1]+'/'+a;
}
function proximoMes(s){
  if(!refValida(s)) return mesAtual();
  let [a,m]=s.split('-').map(Number);
  m++;if(m===13){m=1;a++;}
  return a+'-'+String(m).padStart(2,'0');
}
function mascaraDocumento(v){
  const d=String(v||'').replace(/\D/g,'').slice(0,14);
  if(d.length<=11) return d.replace(/^(\d{3})(\d)/,'$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1-$2');
  return d.replace(/^(\d{2})(\d)/,'$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/,'$1.$2.$3').replace(/\.(\d{3})(\d)/,'.$1/$2').replace(/(\/\d{4})(\d)/,'$1-$2');
}
function mascaraCPF(v){return mascaraDocumento(v);}
function cpfValido(v){
  const c=String(v||'').replace(/\D/g,'');
  if(c.length!==11||/^(\d)\1{10}$/.test(c)) return false;
  const dig=len=>{let s=0;for(let i=0;i<len;i++)s+=Number(c[i])*(len+1-i);let r=(s*10)%11;return r===10?0:r;};
  return dig(9)===Number(c[9])&&dig(10)===Number(c[10]);
}
function cnpjValido(v){
  const c=String(v||'').replace(/\D/g,'');
  if(c.length!==14||/^(\d)\1{13}$/.test(c)) return false;
  const calcular=tamanho=>{
    const pesos=tamanho===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];
    const soma=pesos.reduce((total,peso,i)=>total+Number(c[i])*peso,0),resto=soma%11;
    return resto<2?0:11-resto;
  };
  return calcular(12)===Number(c[12])&&calcular(13)===Number(c[13]);
}
function documentoValido(v){
  const tamanho=String(v||'').replace(/\D/g,'').length;
  return tamanho===11?cpfValido(v):tamanho===14?cnpjValido(v):false;
}
function tipoDocumento(v){return String(v||'').replace(/\D/g,'').length===14?'CNPJ':'CPF';}

const U = ['zero','um','dois','tres','quatro','cinco'];
U.push('seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove');
const D=['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const C=['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];

function ate999(n){
  n=Math.floor(n);
  if(n<20) return U[n];
  if(n<100) return D[Math.floor(n/10)] + (n%10 ? ' e '+U[n%10] : '');
  if(n===100) return 'cem';
  return C[Math.floor(n/100)] + (n%100 ? ' e '+ate999(n%100) : '');
}
function inteiroExtenso(n){
  n=Math.floor(n);
  if(n===0) return 'zero';
  if(n<1000) return ate999(n);
  if(n<1000000){
    const mil=Math.floor(n/1000), resto=n%1000;
    const inicio=(mil===1?'mil':ate999(mil)+' mil');
    if(!resto) return inicio;
    return inicio + (resto<100 || resto%100===0 ? ' e ' : ' ') + ate999(resto);
  }
  if(n<1000000000){
    const mi=Math.floor(n/1000000), resto=n%1000000;
    const inicio=(mi===1?'um milhao':inteiroExtenso(mi)+' milhoes');
    if(!resto) return inicio;
    return inicio + (resto<100 ? ' e ' : ' ') + inteiroExtenso(resto);
  }
  return String(n);
}
function valorExtenso(valor){
  const total=Math.round((Number(valor)||0)*100);
  const reais=Math.floor(total/100), cent=total%100;
  let partes=[];
  if(reais>0) partes.push(`${inteiroExtenso(reais)} ${reais===1?'real':'reais'}`);
  if(cent>0) partes.push(`${inteiroExtenso(cent)} ${cent===1?'centavo':'centavos'}`);
  return partes.length?partes.join(' e '):'zero reais';
}
function ajustarAcentos(txt){
  return txt.replace(/\btres\b/g,'três').replace(/\bmilhao\b/g,'milhão').replace(/\bmilhoes\b/g,'milhões');
}

function setEmpty(el,value,placeholder){
  const has=String(value||'').trim().length>0;
  el.textContent=has?value:placeholder;
  el.classList.toggle('empty',!has);
}
function dadosFormulario(){
  const amount=parseValor($('amount').value);
  return {
    number:nroAtivo(),year:anoSel(),amount,
    amountWords:Number.isFinite(amount)?ajustarAcentos(valorExtenso(amount)):'',
    tenant:$('tenant').value.trim(),cpf:$('cpf').value.trim(),
    property:$('property').value.trim(),contractCode:$('contractCode').value.trim(),
    dueDay:$('dueDay').value===''?0:Number($('dueDay').value),reference:$('reference').value,
    payment:$('payment').value,receiptDate:$('receiptDate').value,operator:$('operator').value
  };
}
function capturarRascunho(){return normalizarRascunho({amount:$('amount').value,tenant:$('tenant').value,cpf:$('cpf').value,property:$('property').value,contractCode:$('contractCode').value,dueDay:$('dueDay').value,reference:$('reference').value,payment:$('payment').value,receiptDate:$('receiptDate').value,operator:$('operator').value,savedTenantId:$('savedTenant').value,savedAt:new Date().toISOString()});}
function salvarRascunho(){
  if(activeRecord){toast('Recibos emitidos já estão registrados no histórico.');return;}
  if(storageCorrupted){toast('Resolva o aviso de recuperação antes de salvar.',true);return;}
  if(!['amount','tenant','cpf','property','contractCode','dueDay'].some(id=>String($(id).value||'').trim())){toast('Preencha ao menos um dado antes de salvar o rascunho.',true);return;}
  const draft=capturarRascunho();if(!persistir({...state,draft}))return;draftDirty=false;atualizar();toast('Rascunho salvo neste navegador.');
}
function restaurarRascunho(){
  const r=state.draft;if(!r)return false;
  $('amount').value=r.amount||'';$('tenant').value=r.tenant||'';$('cpf').value=mascaraDocumento(r.cpf||'');$('property').value=r.property||'';$('contractCode').value=r.contractCode||'';$('dueDay').value=r.dueDay||'';$('reference').value=r.reference||mesAtual();$('payment').value=pagamentos.includes(r.payment)?r.payment:'Dinheiro';$('receiptDate').value=dataValida(r.receiptDate)?r.receiptDate:hoje();$('operator').value=operadores.includes(r.operator)?r.operator:(state.meta.defaultOperator||operadores[0]);renderCadastros(r.savedTenantId||'');draftDirty=false;return true;
}
function validarDados(d,{numero=true}={}){
  const e={};
  if(!Number.isFinite(d.amount)||d.amount<=0||d.amount>MAX_AMOUNT) e.amount='Informe um valor entre R$ 0,01 e R$ 999.999.999,99.';
  if(!d.tenant) e.tenant='Informe o nome do locatário.';
  else if(d.tenant.length>200) e.tenant='Use até 200 caracteres.';
  if(!d.cpf) e.cpf='Informe o CPF ou CNPJ do locatário.';
  else if(!documentoValido(d.cpf)) e.cpf='O CPF ou CNPJ informado não é válido.';
  if(!d.property) e.property='Informe a localização do imóvel.';
  else if(d.property.length>1500) e.property='Use até 1.500 caracteres.';
  if(String(d.contractCode||'').length>60) e.contractCode='Use até 60 caracteres.';
  if(d.dueDay!==0&&(!Number.isInteger(Number(d.dueDay))||Number(d.dueDay)<1||Number(d.dueDay)>31)) e.dueDay='Informe um dia entre 1 e 31.';
  if(!refValida(d.reference)) e.reference='Informe um mês e ano válidos.';
  if(!pagamentos.includes(d.payment)) e.payment='Selecione uma forma de pagamento válida.';
  if(!dataValida(d.receiptDate)) e.receiptDate='Informe uma data válida.';
  if(!operadores.includes(d.operator)) e.operator='Selecione o responsável pela emissão.';
  if(numero&&(!/^\d{2,}\/\d{4}$/.test(d.number)||Number(d.number.split('/')[0])<1||
    Number(d.number.split('/')[1])!==Number(d.year)||Number(d.year)!==Number(String(d.receiptDate).slice(0,4)))) e._number='Confira o número e o ano do recibo.';
  return e;
}
function mostrarErros(erros){
  errorFields.forEach(id=>{
    const msg=erros[id]||'';
    $(id+'Error').textContent=msg;
    $(id).setAttribute('aria-invalid',msg?'true':'false');
  });
  const primeiro=errorFields.find(id=>erros[id]);
  if(primeiro){const campo=$(primeiro),secao=campo.closest('details');if(secao)secao.open=true;requestAnimationFrame(()=>{campo.focus();campo.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});}
  if(erros._number) toast(erros._number,true);
  return !primeiro&&!erros._number;
}
function limparErroCampo(id){
  if(!errorFields.includes(id)) return;
  $(id+'Error').textContent='';
  $(id).setAttribute('aria-invalid','false');
}
function toast(msg,erro=false){
  const el=$('toast');
  el.textContent=msg;el.classList.toggle('error',erro);el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>el.classList.remove('show'),3400);
}
function baixarBlob(blob,nome){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function atualizarBackupStatus(){
  const card=$('backupStatus'),texto=$('backupStatusText');
  $('recoveryPanel').hidden=!storageCorrupted;
  if(storageCorrupted){
    card.className='safety-card danger';texto.textContent='Emissões e alterações estão bloqueadas até a recuperação ser resolvida.';return;
  }
  const ultimo=state&&state.meta?state.meta.lastBackupAt:'';
  const data=ultimo?new Date(ultimo):null;
  const dias=data&&!Number.isNaN(data.getTime())?Math.floor((Date.now()-data.getTime())/86400000):Infinity;
  if(!data||Number.isNaN(data.getTime())){
    card.className='safety-card warning';texto.textContent='Nenhum backup registrado. Exporte uma cópia antes de iniciar o uso regular.';
  }else if(dias>=BACKUP_WARNING_DAYS){
    card.className='safety-card warning';texto.textContent='Último backup: '+dataHora(ultimo)+' ('+dias+' dias). Recomenda-se exportar uma nova cópia.';
  }else{
    card.className='safety-card';texto.textContent='Último backup: '+dataHora(ultimo)+'. Situação regular.';
  }
}
function baixarDadosRecuperacao(){
  if(!recoveryRaw)return;
  baixarBlob(new Blob([recoveryRaw],{type:'application/json'}),'dados-corrompidos-recibos-'+hoje()+'.json');
  toast('Cópia dos dados corrompidos baixada para análise.');
}
function iniciarHistoricoVazio(){
  if(!storageCorrupted||!confirm('Isso substituirá os dados locais corrompidos por um histórico vazio. Confirma?'))return;
  localStorage.removeItem(KEY);storageCorrupted=false;recoveryRaw='';
  state={counters:{},documentCounters:{},history:[],documents:[],draftDocuments:[],templates:[],contacts:[],draft:null,management:{},meta:metaNormalizada({})};
  persistir(state);activeRecord=null;draftDirty=false;historyPage=1;
  limpar();renderHistorico();atualizar();toast('Novo histórico iniciado.');
}
function atualizar(){
  const d=activeRecord||dadosFormulario();
  const amount=Number(d.amount);
  const ext=Number.isFinite(amount)&&amount>0?ajustarAcentos(valorExtenso(amount)):'';
  const status=activeRecord?statusRegistro(activeRecord):'draft';
  $('nextNumberLabel').textContent=nro(anoSel(),proxSeq(anoSel()));
  $('pNumber').textContent=d.number;
  $('pAmount').textContent=moeda(amount);
  $('pAmountInline').textContent=moeda(amount);
  $('pAmountBottom').textContent=moeda(amount);
  $('amountWords').textContent=ext||'—';
  $('pWords').textContent=ext||'valor por extenso';
  setEmpty($('pTenant'),String(d.tenant||'').toUpperCase(),'NOME DO LOCATÁRIO');
  $('pDocumentLabel').textContent=tipoDocumento(d.cpf);
  setEmpty($('pCpf'),d.cpf,tipoDocumento(d.cpf)==='CNPJ'?'00.000.000/0000-00':'000.000.000-00');
  setEmpty($('pProperty'),d.property,'Localização do imóvel');
  setEmpty($('pReference'),refValida(d.reference)?refTexto(d.reference):'','mês/ano');
  $('pPayment').textContent=d.payment||'Dinheiro';
  $('pDate').textContent=dataLonga(d.receiptDate);
  $('summaryNumber').textContent=d.number||'—';$('summaryTenant').textContent=String(d.tenant||'').trim()||'Não informado';$('summaryAmount').textContent=Number.isFinite(amount)&&amount>0?moeda(amount):'R$ 0,00';$('summaryReference').textContent=refValida(d.reference)?refTexto(d.reference):'Não informada';
  $('pCancelNotice').hidden=status!=='canceled';
  $('pCancelDetails').textContent=status==='canceled'?
    'Cancelado em '+dataHora(d.canceledAt)+(d.canceledBy?' por '+d.canceledBy:'')+'. Motivo: '+String(d.cancelReason||'Não informado.'):'';

  $('documentStatus').classList.toggle('issued',status==='issued');
  $('documentStatus').classList.toggle('canceled',status==='canceled');
  if(status==='issued') $('documentStatus').textContent='Recibo '+d.number+' emitido e registrado. Os dados estão travados para reimpressão.';
  else if(status==='canceled') $('documentStatus').textContent='Recibo '+d.number+' cancelado. O número permanece reservado no histórico.';
  else if(status!=='draft') $('documentStatus').textContent='Recibo '+d.number+' — '+rotuloStatus(status).toLowerCase()+'.';
  else if(state.draft&&!draftDirty&&state.draft.savedAt) $('documentStatus').textContent='Rascunho salvo em '+dataHora(state.draft.savedAt)+'. Continue a edição ou emita quando estiver pronto.';
  else $('documentStatus').textContent='Rascunho — preencha e confira os dados antes de emitir.';

  $('previewBadge').hidden=!['draft','canceled'].includes(status);
  $('previewBadge').textContent=status==='canceled'?'RECIBO CANCELADO':'RASCUNHO — NÃO EMITIDO';
  $('previewBadge').classList.toggle('canceled',status==='canceled');
  $('printBtn').disabled=!activeRecord;
  $('saveDraftBtn').disabled=!!activeRecord;
  $('issueBtn').disabled=!!activeRecord;
  $('adjustNumber').disabled=!!activeRecord;
  $('duplicateBtn').hidden=!activeRecord;
  $('nextMonthBtn').hidden=!activeRecord;
  document.body.classList.toggle('is-issued',!!activeRecord);
  document.body.classList.toggle('is-canceled',status==='canceled');
  atualizarBackupStatus();
  atualizarVisaoSeguranca();
  ajustarAlturaMobile();
}
function ajustarAlturaMobile(){
  const workspace=document.querySelector('.workspace');if(!workspace)return;
  const mobile=window.matchMedia('(max-width:767px)').matches,available=mobile?Math.max(280,window.innerWidth-20):Math.max(280,workspace.clientWidth-36);
  if(currentDocumentType==='receipt'){
    const shell=document.querySelector('.page-shell'),receipt=$('receipt');if(!shell||!receipt)return;const baseWidth=receipt.offsetWidth||794,baseHeight=receipt.offsetHeight||1123,scale=Math.min(1,available/baseWidth);receipt.style.setProperty('--preview-scale',String(scale));shell.style.width=Math.ceil(baseWidth*scale)+'px';shell.style.height=Math.ceil(baseHeight*scale)+'px';
  }else{
    const shell=$('documentPageShell'),doc=$('documentPreview');if(!shell||!doc)return;const baseWidth=doc.offsetWidth||794,baseHeight=Math.max(doc.scrollHeight||1123,1123),scale=Math.min(1,available/baseWidth);doc.style.setProperty('--document-preview-scale',String(scale));shell.style.width=Math.ceil(baseWidth*scale)+'px';shell.style.height=Math.ceil(baseHeight*scale)+'px';
  }
}
function atualizarVisaoSeguranca(){$('safetyReceiptsCount').textContent=String(state.history.length);$('safetyDocumentsCount').textContent=String(state.documents.length);$('safetyDraftsCount').textContent=String(state.draftDocuments.length+(state.draft?1:0));$('safetyTemplatesCount').textContent=String(state.templates.length);$('safetyContactsCount').textContent=String(state.contacts.length);$('safetySchemaVersion').textContent=String(SCHEMA_VERSION);$('safetyLastBackup').textContent=state.meta.lastBackupAt?dataHora(state.meta.lastBackupAt):'Não registrado';}
function conteudoCabeEmUmaPagina(){
  const limiteA4=(297/25.4)*96;
  return $('receipt').scrollHeight<=limiteA4+4;
}
function travar(travado){
  campos.forEach(id=>$(id).disabled=travado);
  $('savedTenant').disabled=travado;
  $('saveContactBtn').disabled=travado;
  $('deleteContactBtn').disabled=travado||!$('savedTenant').value;
}
function ativarView(nome,{focar=false}={}){
  const tab=$('tab-'+nome),panel=$('view-'+nome);if(!tab||!panel)return;currentView=nome;
  document.querySelectorAll('.app-tabs [role="tab"]').forEach(item=>{const ativo=item===tab;item.setAttribute('aria-selected',ativo?'true':'false');item.tabIndex=ativo?0:-1;});
  document.querySelectorAll('.view-panel').forEach(item=>{const ativo=item===panel;item.hidden=!ativo;item.classList.toggle('is-active',ativo);});fecharPreview();
  if(nome==='history')renderHistorico();if(nome==='contacts')renderGerenciadorCadastros();if(nome==='templates')renderModelos();if(nome==='safety'){atualizarBackupStatus();atualizarVisaoSeguranca();}if(nome==='new')setTimeout(ajustarAlturaMobile,0);if(focar)tab.focus();window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
}
function abrirPreview(){document.body.classList.add('preview-open');$('previewMobileBtn').setAttribute('aria-expanded','true');setTimeout(()=>{ajustarAlturaMobile();$(currentDocumentType==='receipt'?'previewCloseBtn':'genericPreviewCloseBtn').focus();},0);}
function fecharPreview(){const aberta=document.body.classList.contains('preview-open');document.body.classList.remove('preview-open');$('previewMobileBtn').setAttribute('aria-expanded','false');if(aberta)setTimeout(ajustarAlturaMobile,0);}
function idContato(c){
  const base=String(c.cpf||'').replace(/\D/g,'')+'|'+normalizarTexto(c.property);
  let h=2166136261;
  for(let i=0;i<base.length;i++){h^=base.charCodeAt(i);h=Math.imul(h,16777619);}
  return 'cad-'+(h>>>0).toString(36);
}
function contatoDosDados(d){
  const valor=Number(d.amount);
  const c={
    tenant:String(d.tenant||'').trim(),cpf:mascaraDocumento(d.cpf),property:String(d.property||'').trim(),
    amount:Number.isFinite(valor)&&valor>0?valor:0,
    payment:pagamentos.includes(d.payment)?d.payment:'Dinheiro',
    contractCode:String(d.contractCode||'').trim(),
    dueDay:Number.isInteger(Number(d.dueDay))&&Number(d.dueDay)>=1&&Number(d.dueDay)<=31?Number(d.dueDay):0,
    active:d.active!==false
  };
  return {...c,id:idContato(c),updatedAt:new Date().toISOString()};
}
function upsertContato(lista,d){
  const novo=contatoDosDados(d);
  const selecionado=editingContactId||$('savedTenant').value;
  const idx=lista.findIndex(c=>c.id===(selecionado||novo.id));
  if(idx<0) return [...lista,novo];
  const copy=lista.slice(),ativoAnterior=copy[idx].active!==false;
  copy[idx]={...copy[idx],...novo,id:copy[idx].id,active:ativoAnterior};return copy;
}
function renderCadastros(selecionar=''){
  const sel=$('savedTenant'),atual=selecionar||sel.value;
  sel.replaceChildren();
  const vazio=document.createElement('option');vazio.value='';vazio.textContent='Selecionar locatário e imóvel...';sel.appendChild(vazio);
  state.contacts.filter(c=>c.active!==false).sort((a,b)=>String(a.tenant||'').localeCompare(String(b.tenant||''),'pt-BR')).forEach(c=>{
    const op=document.createElement('option');op.value=String(c.id||'');
    op.textContent=String(c.tenant||'Sem nome')+' — '+String(c.property||'Sem imóvel');
    sel.appendChild(op);
  });
  sel.value=state.contacts.some(c=>c.active!==false&&String(c.id)===String(atual))?String(atual):'';
  const escolhido=state.contacts.find(c=>String(c.id)===String(sel.value));
  $('deleteContactBtn').disabled=!!activeRecord||!escolhido||escolhido.active===false;
  if(!activeRecord)editingContactId=escolhido?escolhido.id:'';
  if(!sel.value)$('savedTenantStatus').textContent='Selecione um cadastro para preencher nome, CPF e imóvel automaticamente.';
  renderGerenciadorCadastros();
}
function contatosFiltrados(){const busca=normalizarTexto($('contactsSearch').value),status=$('contactsStatus').value;return state.contacts.filter(c=>(status==='all'||(status==='active'&&c.active!==false)||(status==='inactive'&&c.active===false))&&(!busca||normalizarTexto([c.tenant,c.cpf,String(c.cpf||'').replace(/\D/g,''),c.property,c.contractCode,c.payment].join(' ')).includes(busca))).sort((a,b)=>String(a.tenant||'').localeCompare(String(b.tenant||''),'pt-BR'));}
function duplicidadesCadastro(){const vistos=new Set(),duplicados=new Set();state.contacts.forEach(c=>{const chave=String(c.cpf||'').replace(/\D/g,'')+'|'+normalizarTexto(c.property);if(vistos.has(chave))duplicados.add(chave);vistos.add(chave);});return duplicados.size;}
function renderGerenciadorCadastros(){
  const box=$('contactsList');if(!box)return;const lista=contatosFiltrados(),ativos=state.contacts.filter(c=>c.active!==false).length,inativos=state.contacts.length-ativos;$('contactsSummary').innerHTML='<strong>'+lista.length+'</strong> exibido(s) · <strong>'+ativos+'</strong> ativo(s) · <strong>'+inativos+'</strong> inativo(s) · <strong>'+duplicidadesCadastro()+'</strong> duplicidade(s) exata(s)';box.replaceChildren();
  if(!lista.length){const vazio=document.createElement('div');vazio.className='empty-state';vazio.textContent=state.contacts.length?'Nenhum cadastro corresponde aos filtros.':'Nenhum cadastro salvo. Use “Novo cadastro” para começar.';box.appendChild(vazio);return;}
  lista.forEach(c=>{const card=document.createElement('article');card.className='contact-card'+(c.active===false?' is-inactive':'');const head=document.createElement('div');head.className='contact-card-head';const titulo=document.createElement('div'),nome=document.createElement('h3'),doc=document.createElement('p'),badge=document.createElement('span');nome.textContent=c.tenant;doc.className='document';doc.textContent=tipoDocumento(c.cpf)+' '+c.cpf;titulo.append(nome,doc);badge.className='status-badge'+(c.active===false?' canceled':'');badge.textContent=c.active===false?'Inativo':'Ativo';head.append(titulo,badge);const property=document.createElement('div');property.className='contact-property';property.textContent=c.property;const meta=document.createElement('div');meta.className='contact-meta';const linha=(r,v)=>{const s=document.createElement('span'),b=document.createElement('b');b.textContent=r+': ';s.append(b,document.createTextNode(v));return s;};meta.append(linha('Valor',Number(c.amount)>0?moeda(c.amount):'não informado'),linha('Pagamento',c.payment),linha('Contrato',(c.contractCode||'sem código')+(c.dueDay?' · vencimento dia '+c.dueDay:'')));const actions=document.createElement('div');actions.className='contact-actions';if(c.active!==false)actions.append(botaoHistorico('Usar no recibo',()=>carregarCadastroGerenciado(c.id,false),'primary'));actions.append(botaoHistorico('Editar',()=>carregarCadastroGerenciado(c.id,true)),botaoHistorico(c.active===false?'Reativar':'Inativar',()=>alternarCadastro(c.id),c.active===false?'':'danger'));card.append(head,property,meta,actions);box.appendChild(card);});
}
function carregarCadastroGerenciado(id,edicao){if(!confirmarDescartarRascunho())return;const c=state.contacts.find(item=>item.id===id);if(!c)return;if(c.active===false&&!edicao){toast('Reative o cadastro antes de usá-lo em um recibo.',true);return;}activeRecord=null;pendingIssue=null;travar(false);mostrarErros({});if(c.active===false){$('savedTenant').value='';editingContactId=c.id;$('tenant').value=c.tenant||'';$('cpf').value=mascaraDocumento(c.cpf||'');$('property').value=c.property||'';$('amount').value=Number(c.amount)>0?valorCampo(c.amount):'';if(pagamentos.includes(c.payment))$('payment').value=c.payment;$('contractCode').value=c.contractCode||'';$('dueDay').value=Number(c.dueDay)>0?String(c.dueDay):'';['amount','tenant','cpf','property','contractCode','dueDay','payment'].forEach(limparErroCampo);draftDirty=true;atualizar();}else{$('savedTenant').value=id;selecionarCadastro({currentTarget:$('savedTenant')});}ativarView('new');$('savedTenantStatus').textContent=c.active===false?'Cadastro inativo aberto somente para edição. Para utilizá-lo, reative-o na tela Cadastros.':(edicao?'Cadastro aberto para edição. Ajuste os dados e clique em “Salvar cadastro”.':'Cadastro carregado no novo recibo.');setTimeout(()=>$(edicao?'tenant':'amount').focus(),0);}
function alternarCadastro(id){const c=state.contacts.find(item=>item.id===id);if(!c)return;const ativar=c.active===false;if(!confirm((ativar?'Reativar':'Inativar')+' o cadastro de '+c.tenant+' para este imóvel?'))return;const contacts=state.contacts.map(item=>item.id===id?{...item,active:ativar,updatedAt:new Date().toISOString()}:item);if(!persistir({...state,contacts}))return;renderCadastros();toast('Cadastro '+(ativar?'reativado.':'inativado e preservado.'));}
function selecionarCadastro(evento){
  const selecionado=evento&&evento.currentTarget?evento.currentTarget.value:$('savedTenant').value;
  const c=state.contacts.find(x=>String(x.id)===String(selecionado));
  $('deleteContactBtn').disabled=!!activeRecord||!c||c.active===false;
  if(!selecionado){
    editingContactId='';
    $('savedTenantStatus').textContent='Selecione um cadastro para preencher nome, CPF e imóvel automaticamente.';
    return;
  }
  if(!c){
    $('savedTenantStatus').textContent='Não foi possível localizar este cadastro. Salve-o novamente.';
    toast('Cadastro não encontrado. Salve os dados novamente.',true);
    return;
  }
  if(activeRecord) return;
  editingContactId=c.id;
  $('tenant').value=c.tenant||'';
  $('cpf').value=mascaraDocumento(c.cpf||'');
  $('property').value=c.property||'';
  $('amount').value=Number(c.amount)>0?valorCampo(c.amount):'';
  if(pagamentos.includes(c.payment))$('payment').value=c.payment;
  $('contractCode').value=c.contractCode||'';
  $('dueDay').value=Number(c.dueDay)>0?String(c.dueDay):'';
  ['amount','tenant','cpf','property','contractCode','dueDay','payment'].forEach(limparErroCampo);
  $('savedTenantStatus').textContent=(c.active===false?'Cadastro inativo carregado. Salve-o para reativar: ':'Cadastro carregado: ')+c.tenant+'. Documento, imóvel, valor e pagamento preenchidos.';
  draftDirty=true;
  atualizar();
  toast('Cadastro de '+c.tenant+' carregado.');
}
function salvarCadastro(){
  if(activeRecord) return;
  const d=dadosFormulario(),erros=validarDados(d,{numero:false});
  const subset={amount:erros.amount,tenant:erros.tenant,cpf:erros.cpf,property:erros.property,contractCode:erros.contractCode,dueDay:erros.dueDay,payment:erros.payment};
  if(!mostrarErros(subset)){toast('Confira os dados do cadastro.',true);return;}
  const novo=contatoDosDados(d),idEditado=editingContactId||$('savedTenant').value;
  const anterior=state.contacts.find(c=>String(c.id)===String(idEditado));
  const permaneceInativo=!!anterior&&anterior.active===false;
  const contacts=upsertContato(state.contacts,d);
  if(!persistir({...state,contacts})) return;
  const idSalvo=anterior?anterior.id:novo.id;
  renderCadastros(permaneceInativo?'':idSalvo);
  editingContactId=idSalvo;
  $('savedTenantStatus').textContent=permaneceInativo?'Cadastro inativo atualizado. Reative-o na tela Cadastros para utilizá-lo.':'Cadastro salvo e selecionado: '+novo.tenant+'.';
  toast(permaneceInativo?'Cadastro inativo atualizado sem reativação.':'Cadastro salvo para preenchimento rápido.');
}
function excluirCadastro(){
  const id=$('savedTenant').value;
  const c=state.contacts.find(x=>x.id===id);
  if(!c||activeRecord) return;
  if(!confirm('Inativar o cadastro de '+c.tenant+' para este imóvel? Ele continuará no backup e poderá ser reativado ao salvá-lo novamente.')) return;
  const contacts=state.contacts.map(x=>x.id===id?{...x,active:false,updatedAt:new Date().toISOString()}:x);
  if(!persistir({...state,contacts})) return;
  renderCadastros();toast('Cadastro inativado e preservado no histórico.');
}
function preencherFormulario(r){
  $('amount').value=valorCampo(r.amount);
  $('tenant').value=r.tenant||'';
  $('cpf').value=mascaraDocumento(r.cpf||'');
  $('property').value=r.property||'';
  $('contractCode').value=r.contractCode||'';
  $('dueDay').value=Number(r.dueDay)>0?String(r.dueDay):'';
  $('reference').value=r.reference||mesAtual();
  $('payment').value=pagamentos.includes(r.payment)?r.payment:'Dinheiro';
  $('receiptDate').value=dataValida(r.receiptDate)?r.receiptDate:hoje();
  $('operator').value=operadores.includes(r.operator)?r.operator:(state.meta.defaultOperator||operadores[0]);
  const contato=state.contacts.find(c=>String(c.cpf).replace(/\D/g,'')===String(r.cpf).replace(/\D/g,'')&&normalizarTexto(c.property)===normalizarTexto(r.property));
  renderCadastros(contato?contato.id:'');
}
function confirmarDescartarRascunho(){
  return !draftDirty||!!activeRecord||confirm('Há alterações ainda não emitidas. Deseja descartá-las?');
}
function limpar(){
  if(!confirmarDescartarRascunho()) return false;
  if(!storageCorrupted)persistir({...state,draft:null});activeRecord=null;pendingIssue=null;editingContactId='';
  travar(false);mostrarErros({});
  $('amount').value='';$('tenant').value='';$('cpf').value='';$('property').value='';
  $('contractCode').value='';$('dueDay').value='';
  $('reference').value=mesAtual();$('payment').value='Dinheiro';$('receiptDate').value=hoje();
  $('operator').value=state.meta.defaultOperator||operadores[0];draftDirty=false;
  renderCadastros();atualizar();$('amount').focus();return true;
}
function criarRascunhoDe(r,avancarMes=false){
  if(!confirmarDescartarRascunho()) return;
  if(!storageCorrupted)persistir({...state,draft:null});activeRecord=null;pendingIssue=null;editingContactId='';travar(false);mostrarErros({});
  preencherFormulario({...r,reference:avancarMes?proximoMes(r.reference):r.reference,receiptDate:hoje()});
  draftDirty=true;atualizar();$('amount').focus();
  toast(avancarMes?'Rascunho do próximo mês criado. Confira antes de emitir.':'Recibo duplicado como novo rascunho. Confira antes de emitir.');
}
function duplicar(){ if(activeRecord) criarRascunhoDe(activeRecord,false); }
function gerarProximoMes(){ if(activeRecord) criarRascunhoDe(activeRecord,true); }
function botaoHistorico(label,acao,classe=''){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  if(classe)b.className=classe;
  b.addEventListener('click',evento=>{const menu=b.closest('.history-menu');if(menu)menu.open=false;acao(evento);});return b;
}
function rotuloTipo(tipo){return DOCUMENT_TYPES[tipo]?DOCUMENT_TYPES[tipo].label:'Documento';}
function statusDocumento(r){return DOCUMENT_STATUSES.includes(r&&r.status)?r.status:'issued';}
function rotuloStatus(status){return {draft:'Rascunho',review:'Em revisão',issued:'Emitido',sent:'Enviado',awaiting_signature:'Aguardando assinatura',signed:'Assinado',rejected:'Recusado',canceled:'Cancelado',archived:'Arquivado'}[status]||'Emitido';}
function chaveContadorDocumento(tipo,ano){return tipo+'|'+ano;}
function proximaSequenciaDocumento(tipo,ano){const chave=chaveContadorDocumento(tipo,ano),usados=state.documents.filter(r=>r.type===tipo&&Number(r.year)===Number(ano)).map(r=>{const m=String(r.number||'').match(/-(\d+)\//);return m?Number(m[1]):0;});return Math.max(1,Number(state.documentCounters[chave])||1,Math.max(0,...usados)+1);}
function numeroDocumento(tipo,data){const ano=Number(String(data||hoje()).slice(0,4))||new Date().getFullYear();return DOCUMENT_TYPES[tipo].prefix+'-'+String(proximaSequenciaDocumento(tipo,ano)).padStart(3,'0')+'/'+ano;}
function tituloPadraoDocumento(tipo){if(tipo==='declaration')return 'DECLARAÇÃO';if(tipo==='term'){const sub=$('docTermSubtype').value;return {general:'TERMO',keys:'TERMO DE ENTREGA DE CHAVES',termination:'TERMO DE RESCISÃO',rectification:'TERMO DE RETIFICAÇÃO'}[sub]||'TERMO';}if(tipo==='contract'){const sub=$('docContractSubtype').value;return {lease:'CONTRATO DE LOCAÇÃO',sale:'CONTRATO DE COMPRA E VENDA',management:'CONTRATO DE ADMINISTRAÇÃO IMOBILIÁRIA'}[sub]||'CONTRATO';}return 'DOCUMENTO';}
function camposGenericosElementos(){return [...document.querySelectorAll('[data-generic-field]')];}
function coletarCamposGenericos(){const fields={};camposGenericosElementos().forEach(el=>{fields[el.id]=el.type==='checkbox'?el.checked:el.value;});fields.selectedClauses=[...document.querySelectorAll('[data-clause]:checked')].map(el=>el.dataset.clause);return normalizarCamposGenericos(fields);}
function preencherCamposGenericos(fields){const f=normalizarCamposGenericos(fields);camposGenericosElementos().forEach(el=>{if(el.type==='checkbox')el.checked=f[el.id]===true;else el.value=f[el.id]??'';});document.querySelectorAll('[data-clause]').forEach(el=>{el.checked=(f.selectedClauses||[]).includes(el.dataset.clause);});atualizarCamposCondicionais();}
function dadosDocumentoGenerico(){const fields=coletarCamposGenericos(),date=fields.docDate||hoje(),year=Number(date.slice(0,4));return {id:activeGenericRecord?activeGenericRecord.id:(editingGenericDraftId||idDocumento()),type:currentDocumentType,templateVersion:1,templateId:$('docTemplate').value||'',number:activeGenericRecord?activeGenericRecord.number:numeroDocumento(currentDocumentType,date),year,status:activeGenericRecord?statusDocumento(activeGenericRecord):'draft',letterhead:['none','first','repeat'].includes(fields.docLetterhead)?fields.docLetterhead:'none',footerEnabled:fields.docFooterEnabled===true,fields,operator:operadores.includes(fields.docOperator)?fields.docOperator:operadores[0]};}
function limparErrosGenericos(){genericErrorIds.forEach(id=>{const err=$(id+'Error');if(err)err.textContent='';const input=$(id);if(input)input.setAttribute('aria-invalid','false');});}
function validarDocumentoGenerico(d){const f=d.fields,e={};if(String(f.docTitle||'').trim().length<3)e.docTitle='Informe um título com pelo menos 3 caracteres.';if(!dataValida(f.docDate))e.docDate='Informe uma data válida.';if(String(f.docCity||'').trim().length<3)e.docCity='Informe a cidade e o estado.';if(d.type==='declaration'){if(String(f.docDeclarant||'').trim().length<3)e.docDeclarant='Informe o nome do declarante.';if(!documentoValido(f.docDeclarantDocument))e.docDeclarantDocument='Informe um CPF ou CNPJ válido.';if(String(f.docSubject||'').trim().length<3)e.docSubject='Informe o assunto.';if(String(f.docBody||'').trim().length<20)e.docBody='O texto deve ter pelo menos 20 caracteres.';}if(d.type==='term'){if(String(f.docPartyOne||'').trim().length<3)e.docPartyOne='Informe a primeira parte.';if(String(f.docProperty||'').trim().length<3)e.docProperty='Informe o imóvel ou objeto.';if(String(f.docObligations||'').trim().length<10)e.docObligations='Descreva as obrigações e condições.';}if(d.type==='contract'){if(String(f.docContractProperty||'').trim().length<3)e.docContractProperty='Informe o imóvel ou objeto do contrato.';if(String(f.docCustomClauses||'').trim().length<10&&!(f.selectedClauses||[]).length)e.docCustomClauses='Adicione ao menos uma cláusula da biblioteca ou uma cláusula personalizada.';const sub=f.docContractSubtype;if(sub==='lease'&&(!String(f.docLandlord||'').trim()||!String(f.docTenantParty||'').trim()))e.docContractProperty='Informe locador e locatário antes de emitir.';if(sub==='sale'&&(!String(f.docSeller||'').trim()||!String(f.docBuyer||'').trim()))e.docContractProperty='Informe vendedor e comprador antes de emitir.';if(sub==='management'&&!String(f.docLandlord||'').trim())e.docContractProperty='Informe o proprietário antes de emitir.';}return e;}
function mostrarErrosGenericos(erros){limparErrosGenericos();let primeiro=null;for(const [id,msg] of Object.entries(erros)){const err=$(id+'Error'),input=$(id);if(err)err.textContent=msg;if(input){input.setAttribute('aria-invalid','true');if(!primeiro)primeiro=input;}}if(primeiro){const secao=primeiro.closest('details');if(secao)secao.open=true;requestAnimationFrame(()=>{primeiro.focus();primeiro.scrollIntoView({block:'center',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});});return false;}return true;}
function atualizarCamposCondicionais(){document.querySelectorAll('.doc-type-fields').forEach(el=>el.hidden=el.dataset.docType!==currentDocumentType);const contrato=$('docContractSubtype').value||'lease';document.querySelectorAll('.contract-role').forEach(el=>el.hidden=!String(el.dataset.contractTypes||'').split(/\s+/).includes(contrato));const termo=$('docTermSubtype').value||'general';document.querySelectorAll('.term-conditional').forEach(el=>el.hidden=el.dataset.termSubtype!==termo);if(!activeGenericRecord&&!String($('docTitle').value||'').trim())$('docTitle').value=tituloPadraoDocumento(currentDocumentType);atualizarOpcoesModelos();}
function atualizarCadastrosDocumento(){const sel=$('docQuickContact'),atual=sel.value;sel.replaceChildren();const vazio=document.createElement('option');vazio.value='';vazio.textContent='Selecionar pessoa e imóvel...';sel.appendChild(vazio);state.contacts.filter(c=>c.active!==false).sort((a,b)=>String(a.tenant).localeCompare(String(b.tenant),'pt-BR')).forEach(c=>{const op=document.createElement('option');op.value=c.id;op.textContent=c.tenant+' — '+c.property;sel.appendChild(op);});sel.value=state.contacts.some(c=>c.active!==false&&c.id===atual)?atual:'';}
function aplicarCadastroDocumento(){const c=state.contacts.find(x=>x.id===$('docQuickContact').value&&x.active!==false);if(!c)return;if(currentDocumentType==='declaration'){$('docDeclarant').value=c.tenant;$('docDeclarantDocument').value=c.cpf;}else if(currentDocumentType==='term'){$('docPartyOne').value=c.tenant;$('docPartyOneDocument').value=c.cpf;$('docProperty').value=c.property;}else if(currentDocumentType==='contract'){const sub=$('docContractSubtype').value;if(sub==='sale'){$('docBuyer').value=c.tenant;$('docBuyerDocument').value=c.cpf;}else{$('docTenantParty').value=c.tenant;$('docTenantPartyDocument').value=c.cpf;}$('docContractProperty').value=c.property;}genericDirty=true;atualizarDocumentoGenerico();toast('Cadastro ativo aplicado ao documento.');}
function atualizarOpcoesModelos(){const sel=$('docTemplate'),atual=sel.value;sel.replaceChildren();const padrao=document.createElement('option');padrao.value='';padrao.textContent='Modelo padrão';sel.appendChild(padrao);state.templates.filter(t=>t.active!==false&&t.type===currentDocumentType).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')).forEach(t=>{const op=document.createElement('option');op.value=t.id;op.textContent=t.name;sel.appendChild(op);});sel.value=state.templates.some(t=>t.id===atual&&t.active!==false&&t.type===currentDocumentType)?atual:'';}
function aplicarModeloSelecionado(){const t=state.templates.find(x=>x.id===$('docTemplate').value&&x.active!==false);if(!t)return;preencherCamposGenericos({...t.fields,docDate:hoje(),docOperator:state.meta.defaultOperator||operadores[0]});genericDirty=true;atualizarDocumentoGenerico();toast('Modelo “'+t.name+'” aplicado.');}
function limparDocumentoGenerico({preservarTipo=true}={}){if(genericDirty&&!activeGenericRecord&&!confirm('Há alterações não salvas neste documento. Deseja descartá-las?'))return false;activeGenericRecord=null;editingGenericDraftId='';genericDirty=false;camposGenericosElementos().forEach(el=>{if(el.type==='checkbox')el.checked=false;else el.value='';});document.querySelectorAll('[data-clause]').forEach(el=>el.checked=false);$('docDate').value=hoje();$('docCity').value='Araçariguama/SP';$('docOperator').value=state.meta.defaultOperator||operadores[0];$('docLetterhead').value='none';$('docFooterEnabled').checked=false;$('docTermSubtype').value='general';$('docContractSubtype').value='lease';$('docTitle').value=tituloPadraoDocumento(currentDocumentType);$('docQuickContact').value='';$('docTemplate').value='';limparErrosGenericos();travarDocumentoGenerico(false);atualizarCamposCondicionais();atualizarDocumentoGenerico();return true;}
function selecionarTipoDocumento(tipo,{ignorarConfirmacao=false}={}){if(!DOCUMENT_TYPES[tipo])return;if(!ignorarConfirmacao&&tipo!==currentDocumentType&&((currentDocumentType==='receipt'&&draftDirty&&!activeRecord)||(currentDocumentType!=='receipt'&&genericDirty&&!activeGenericRecord))&&!confirm('Há alterações não salvas. Deseja trocar o tipo de documento?'))return;currentDocumentType=tipo;document.querySelectorAll('[data-document-type]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.documentType===tipo?'true':'false'));$('receiptEditor').hidden=tipo!=='receipt';$('genericEditor').hidden=tipo==='receipt';$('receiptPreviewArea').hidden=tipo!=='receipt';$('genericPreviewArea').hidden=tipo==='receipt';$('editorTitle').textContent=tipo==='receipt'?'Novo recibo':'Novo '+rotuloTipo(tipo).toLowerCase();$('editorSubtitle').textContent=tipo==='receipt'?'Preencha, revise a prévia e confirme a emissão.':'Preencha os campos específicos, escolha o timbre e confira a prévia.';if(tipo!=='receipt'){if(!activeGenericRecord||activeGenericRecord.type!==tipo){activeGenericRecord=null;editingGenericDraftId='';genericDirty=false;limparDocumentoGenerico({preservarTipo:true});}atualizarCamposCondicionais();atualizarCadastrosDocumento();atualizarDocumentoGenerico();}else{atualizar();}ajustarAlturaMobile();}
function adicionarTexto(container,texto,classe=''){if(!String(texto||'').trim())return;const p=document.createElement('p');if(classe)p.className=classe;p.textContent=String(texto).trim();container.appendChild(p);}
function adicionarBloco(container,linhas){const bloco=document.createElement('div');bloco.className='data-block';linhas.filter(x=>x&&String(x).trim()).forEach(x=>adicionarTexto(bloco,x));if(bloco.children.length)container.appendChild(bloco);}
function adicionarTituloSecao(container,texto){const h=document.createElement('h2');h.textContent=texto;container.appendChild(h);}
function assinaturaElemento(nome,detalhe=''){const div=document.createElement('div');div.className='document-signature';const strong=document.createElement('strong');strong.textContent=nome||'Assinatura';div.appendChild(strong);if(detalhe){const span=document.createElement('span');span.textContent=detalhe;div.appendChild(span);}return div;}
function linhasClausulas(f){const selecionadas=(f.selectedClauses||[]).map(k=>CLAUSE_LIBRARY[k]).filter(Boolean),personalizadas=String(f.docCustomClauses||'').split(/\n\s*\n/).map(x=>x.trim()).filter(Boolean);return [...selecionadas,...personalizadas];}
function atualizarDocumentoGenerico(){if(currentDocumentType==='receipt')return;const d=activeGenericRecord||dadosDocumentoGenerico(),f=d.fields,content=$('dpContent'),signatures=$('dpSignatures');content.replaceChildren();signatures.replaceChildren();$('genericNumberLabel').textContent=activeGenericRecord?d.number:numeroDocumento(currentDocumentType,f.docDate);$('genericPreviewLabel').textContent=rotuloTipo(currentDocumentType);$('dpNumber').textContent=(d.status==='draft'?'RASCUNHO · ':rotuloTipo(d.type).toUpperCase()+' Nº ')+(d.number||numeroDocumento(d.type,f.docDate));$('dpDate').textContent=(f.docCity||'Araçariguama/SP')+', '+dataLonga(f.docDate||hoje());$('dpTitle').textContent=f.docTitle||tituloPadraoDocumento(d.type);$('dpRepeatTitle').textContent=f.docTitle||rotuloTipo(d.type);const timbre=d.letterhead||f.docLetterhead||'none';$('documentLetterhead').hidden=timbre==='none';$('documentPreview').classList.toggle('has-repeat-header',timbre==='repeat');$('documentPreview').classList.toggle('has-footer',d.footerEnabled===true);$('dpFooter').hidden=!d.footerEnabled;
  if(d.type==='declaration'){if(f.docRecipient)adicionarTexto(content,'Ao(À) '+f.docRecipient+'.');adicionarBloco(content,['Declarante: '+(f.docDeclarant||'Não informado'),'Documento: '+(f.docDeclarantDocument||'Não informado'),'Assunto: '+(f.docSubject||'Não informado'),f.docPurpose?'Finalidade: '+f.docPurpose:'']);adicionarTexto(content,f.docBody||'Preencha o texto da declaração.');signatures.appendChild(assinaturaElemento(f.docDeclarant||'Declarante',f.docDeclarantDocument||''));signatures.appendChild(assinaturaElemento(f.docOperator||operadores[0],'S.A. Paraíba Imóveis J.R. Ltda.'));}
  if(d.type==='term'){adicionarBloco(content,['Primeira parte: '+(f.docPartyOne||'Não informada')+(f.docPartyOneDocument?' — '+f.docPartyOneDocument:''),f.docPartyTwo?'Segunda parte: '+f.docPartyTwo+(f.docPartyTwoDocument?' — '+f.docPartyTwoDocument:''):'','Imóvel/objeto: '+(f.docProperty||'Não informado'),f.docRelatedContract?'Documento relacionado: '+f.docRelatedContract:'',f.docEffectiveDate?'Data de efeito: '+dataLonga(f.docEffectiveDate):'',f.docDeadline?'Prazo: '+f.docDeadline:'',f.docKeysQuantity?'Chaves: '+f.docKeysQuantity:'']);if(f.docTermSubtype==='rectification'){adicionarTituloSecao(content,'Retificação');adicionarTexto(content,'Onde consta: '+(f.docCorrectionFrom||'—'));adicionarTexto(content,'Passa a constar: '+(f.docCorrectionTo||'—'));adicionarTexto(content,'Permanecem inalteradas e ratificadas as demais disposições do documento original.');}adicionarTituloSecao(content,'Obrigações e condições');adicionarTexto(content,f.docObligations||'Preencha as obrigações e condições.');if(f.docObservations){adicionarTituloSecao(content,'Observações');adicionarTexto(content,f.docObservations);}signatures.appendChild(assinaturaElemento(f.docPartyOne||'Primeira parte',f.docPartyOneDocument||''));if(f.docPartyTwo)signatures.appendChild(assinaturaElemento(f.docPartyTwo,f.docPartyTwoDocument||''));String(f.docSignatures||'').split('\n').map(x=>x.trim()).filter(Boolean).forEach(x=>signatures.appendChild(assinaturaElemento(x)));signatures.appendChild(assinaturaElemento(f.docOperator||operadores[0],'Responsável pela emissão'));}
  if(d.type==='contract'){const sub=f.docContractSubtype||'lease';if(sub==='lease')adicionarBloco(content,['LOCADOR(A): '+(f.docLandlord||'Não informado')+(f.docLandlordDocument?' — '+f.docLandlordDocument:''),'LOCATÁRIO(A): '+(f.docTenantParty||'Não informado')+(f.docTenantPartyDocument?' — '+f.docTenantPartyDocument:''),f.docGuarantors?'FIADOR(ES): '+f.docGuarantors:'']);else if(sub==='sale')adicionarBloco(content,['VENDEDOR(A): '+(f.docSeller||'Não informado')+(f.docSellerDocument?' — '+f.docSellerDocument:''),'COMPRADOR(A): '+(f.docBuyer||'Não informado')+(f.docBuyerDocument?' — '+f.docBuyerDocument:'')]);else adicionarBloco(content,['PROPRIETÁRIO(A): '+(f.docLandlord||'Não informado')+(f.docLandlordDocument?' — '+f.docLandlordDocument:''),'ADMINISTRADORA: S.A. Paraíba Imóveis J.R. Ltda. — CNPJ 09.534.406/0001-29']);adicionarTituloSecao(content,'Objeto');adicionarTexto(content,f.docContractProperty||'Preencha o imóvel ou objeto do contrato.');adicionarBloco(content,[f.docContractPurpose?'Finalidade: '+f.docContractPurpose:'',f.docStartDate?'Início: '+dataLonga(f.docStartDate):'',f.docEndDate?'Término: '+dataLonga(f.docEndDate):'',f.docContractValue?'Valor: R$ '+f.docContractValue:'',f.docContractDueDay?'Vencimento: dia '+f.docContractDueDay:'',f.docAdjustment?'Reajuste: '+f.docAdjustment:'',f.docGuarantee?'Garantia: '+f.docGuarantee:'']);adicionarTituloSecao(content,'Cláusulas e condições');const ol=document.createElement('ol');linhasClausulas(f).forEach(texto=>{const li=document.createElement('li');li.textContent=texto;ol.appendChild(li);});if(!ol.children.length){const li=document.createElement('li');li.textContent='Adicione as cláusulas do contrato.';ol.appendChild(li);}content.appendChild(ol);if(sub==='lease'){signatures.appendChild(assinaturaElemento(f.docLandlord||'Locador(a)',f.docLandlordDocument||''));signatures.appendChild(assinaturaElemento(f.docTenantParty||'Locatário(a)',f.docTenantPartyDocument||''));}else if(sub==='sale'){signatures.appendChild(assinaturaElemento(f.docSeller||'Vendedor(a)',f.docSellerDocument||''));signatures.appendChild(assinaturaElemento(f.docBuyer||'Comprador(a)',f.docBuyerDocument||''));}else{signatures.appendChild(assinaturaElemento(f.docLandlord||'Proprietário(a)',f.docLandlordDocument||''));signatures.appendChild(assinaturaElemento(f.docOperator||operadores[0],'S.A. Paraíba Imóveis J.R. Ltda.'));}if(f.docWitnessOne)signatures.appendChild(assinaturaElemento(f.docWitnessOne,'Testemunha · '+(f.docWitnessOneDocument||'')));if(f.docWitnessTwo)signatures.appendChild(assinaturaElemento(f.docWitnessTwo,'Testemunha · '+(f.docWitnessTwoDocument||'')));}
  const status=statusDocumento(d);$('documentWatermark').textContent=status==='draft'?'RASCUNHO':status==='canceled'?'CANCELADO':status==='archived'?'ARQUIVADO':'';$('documentWatermark').hidden=status==='issued';$('genericStatus').className='generic-status '+status;$('genericStatus').textContent=status==='draft'?(editingGenericDraftId?'Rascunho salvo — continue editando ou emita quando estiver pronto.':'Rascunho novo — '+(timbre==='none'?'sem timbre':'com timbre')+'.'):rotuloTipo(d.type)+' '+d.number+' — '+rotuloStatus(status).toLowerCase()+'.';$('genericPrintBtn').disabled=!activeGenericRecord;$('genericIssueBtn').disabled=!!activeGenericRecord;$('genericSaveDraftBtn').disabled=!!activeGenericRecord;$('genericSaveTemplateBtn').disabled=!!activeGenericRecord;$('genericDuplicateBtn').hidden=!activeGenericRecord;requestAnimationFrame(()=>{const paginas=Math.max(1,Math.ceil(($('documentPreview').scrollHeight||1123)/1123));$('genericPageWarning').textContent=paginas>1?'Documento multipágina: aproximadamente '+paginas+' páginas A4. As assinaturas e cláusulas evitam quebras internas sempre que possível.':'Conteúdo estimado em uma página A4.';ajustarAlturaMobile();});
}
function travarDocumentoGenerico(travado){camposGenericosElementos().forEach(el=>el.disabled=travado);document.querySelectorAll('[data-clause]').forEach(el=>el.disabled=travado);$('docQuickContact').disabled=travado;$('docTemplate').disabled=travado;}
function salvarRascunhoGenerico(){if(storageCorrupted){toast('Resolva a recuperação dos dados antes de salvar.',true);return;}const base=dadosDocumentoGenerico(),agora=new Date().toISOString(),registro=normalizarDocumentoGenerico({...base,id:editingGenericDraftId||base.id,status:'draft',updatedAt:agora,createdAt:agora},{draft:true});let drafts=state.draftDocuments.filter(x=>x.id!==registro.id);drafts.push(registro);if(!persistir({...state,draftDocuments:drafts}))return;editingGenericDraftId=registro.id;genericDirty=false;renderHistorico();atualizarVisaoSeguranca();atualizarDocumentoGenerico();toast('Rascunho de '+rotuloTipo(registro.type).toLowerCase()+' salvo.');}
function emitirDocumentoGenerico(){if(activeGenericRecord||storageCorrupted)return;state=lerEstado();const d=dadosDocumentoGenerico(),erros=validarDocumentoGenerico(d);if(!mostrarErrosGenericos(erros)){toast('Confira os campos indicados antes de emitir.',true);return;}d.number=numeroDocumento(d.type,d.fields.docDate);d.year=Number(d.fields.docDate.slice(0,4));if(!confirm('Emitir '+rotuloTipo(d.type).toLowerCase()+' '+d.number+' com o título “'+d.fields.docTitle+'”?'))return;if(state.documents.some(x=>x.number===d.number)){atualizarDocumentoGenerico();toast('A numeração foi atualizada. Confira e tente novamente.',true);return;}const agora=new Date().toISOString(),registro=normalizarDocumentoGenerico({...d,status:'issued',createdAt:agora,updatedAt:agora,printCount:0,lastPrintedAt:''});const chave=chaveContadorDocumento(d.type,d.year),seq=proximaSequenciaDocumento(d.type,d.year),documents=[...state.documents,registro],draftDocuments=state.draftDocuments.filter(x=>x.id!==editingGenericDraftId);if(!persistir({...state,documents,draftDocuments,documentCounters:{...state.documentCounters,[chave]:seq+1},meta:{...state.meta,defaultOperator:d.operator}}))return;activeGenericRecord=Object.freeze({...registro});editingGenericDraftId='';genericDirty=false;travarDocumentoGenerico(true);renderHistorico();atualizarVisaoSeguranca();atualizarDocumentoGenerico();toast(rotuloTipo(d.type)+' '+d.number+' emitido e registrado.');}
function carregarDocumentoGenerico(r,{duplicar=false}={}){if(!r)return false;currentDocumentType=r.type;selecionarTipoDocumento(r.type,{ignorarConfirmacao:true});activeGenericRecord=duplicar||r.status==='draft'?null:Object.freeze({...r});editingGenericDraftId=r.status==='draft'&&!duplicar?r.id:'';preencherCamposGenericos({...r.fields,docDate:duplicar?hoje():r.fields.docDate});if(duplicar){editingGenericDraftId='';genericDirty=true;}else genericDirty=false;travarDocumentoGenerico(!!activeGenericRecord);ativarView('new');atualizarDocumentoGenerico();toast(duplicar?'Documento duplicado como novo rascunho.':(r.status==='draft'?'Rascunho carregado para edição.':rotuloTipo(r.type)+' '+r.number+' carregado.'));return true;}
function duplicarDocumentoGenerico(){if(activeGenericRecord)carregarDocumentoGenerico(activeGenericRecord,{duplicar:true});}
function cancelarDocumentoGenerico(id){state=lerEstado();const r=state.documents.find(x=>x.id===id);if(!r||r.status==='canceled')return;const motivo=prompt('Informe o motivo do cancelamento de '+r.number+':');if(motivo===null)return;if(motivo.trim().length<3){toast('Informe um motivo com pelo menos 3 caracteres.',true);return;}const agora=new Date().toISOString(),documents=state.documents.map(x=>x.id===id?{...x,status:'canceled',cancelReason:motivo.trim(),canceledAt:agora,canceledBy:state.meta.defaultOperator||operadores[0],updatedAt:agora}:x);if(!persistir({...state,documents}))return;if(activeGenericRecord&&activeGenericRecord.id===id)activeGenericRecord=Object.freeze({...documents.find(x=>x.id===id)});renderHistorico();atualizarDocumentoGenerico();toast('Documento cancelado e preservado no histórico.');}
function arquivarDocumentoGenerico(id){state=lerEstado();const r=state.documents.find(x=>x.id===id);if(!r||!confirm('Arquivar '+r.number+'? O documento continuará disponível no histórico.'))return;const agora=new Date().toISOString(),documents=state.documents.map(x=>x.id===id?{...x,status:'archived',archivedAt:agora,updatedAt:agora}:x);if(!persistir({...state,documents}))return;if(activeGenericRecord&&activeGenericRecord.id===id)activeGenericRecord=Object.freeze({...documents.find(x=>x.id===id)});renderHistorico();atualizarDocumentoGenerico();toast('Documento arquivado.');}
function excluirRascunhoGenerico(id){if(!confirm('Excluir este rascunho?'))return;const drafts=state.draftDocuments.filter(x=>x.id!==id);if(!persistir({...state,draftDocuments:drafts}))return;if(editingGenericDraftId===id){editingGenericDraftId='';genericDirty=false;}renderHistorico();atualizarVisaoSeguranca();toast('Rascunho excluído.');}
function nomeArquivoDocumento(r){const nome=normalizarTexto(nomePrincipalDocumento(r)).split(' ').filter(Boolean).slice(0,4).map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join('_')||'Documento';return rotuloTipo(r.type).replace(/ç/g,'c').replace(/ã/g,'a')+'_'+(r.status==='canceled'?'CANCELADO_':'')+String(r.number||'Rascunho').replace('/','-')+'_'+nome;}
function registrarImpressaoDocumento(id){state=lerEstado();const agora=new Date().toISOString(),documents=state.documents.map(r=>r.id===id?{...r,printCount:(Number(r.printCount)||0)+1,lastPrintedAt:agora}:r);if(!persistir({...state,documents}))return;if(activeGenericRecord&&activeGenericRecord.id===id)activeGenericRecord=Object.freeze({...documents.find(r=>r.id===id)});renderHistorico();}
function imprimirDocumentoGenerico(){if(!activeGenericRecord){toast('Emita e registre o documento antes de imprimir.',true);return;}const anterior=document.title,nome=nomeArquivoDocumento(activeGenericRecord);document.title=nome;document.body.classList.add('printing-generic');document.documentElement.classList.add('printing-generic');atualizarDocumentoGenerico();let restaurado=false;const restaurar=()=>{if(restaurado)return;restaurado=true;document.title=anterior;document.body.classList.remove('printing-generic');document.documentElement.classList.remove('printing-generic');};const id=activeGenericRecord.id;window.addEventListener('afterprint',()=>{registrarImpressaoDocumento(id);restaurar();},{once:true});setTimeout(restaurar,5000);toast('Nome sugerido para o PDF: '+nome+'.pdf');window.print();}
function salvarModeloAtual(){if(currentDocumentType==='receipt'){toast('O recibo possui modelo institucional fixo.',true);return;}const nome=prompt('Nome do novo modelo de '+rotuloTipo(currentDocumentType).toLowerCase()+':');if(nome===null)return;if(nome.trim().length<3){toast('Informe um nome com pelo menos 3 caracteres.',true);return;}const agora=new Date().toISOString(),modelo=normalizarModelo({id:idDocumento(),name:nome.trim(),type:currentDocumentType,fields:coletarCamposGenericos(),active:true,createdAt:agora,updatedAt:agora});if(!persistir({...state,templates:[...state.templates,modelo]}))return;atualizarOpcoesModelos();$('docTemplate').value=modelo.id;renderModelos();atualizarVisaoSeguranca();toast('Modelo personalizado salvo.');}
function renderModelos(){const box=$('templatesList');if(!box)return;const busca=normalizarTexto($('templatesSearch').value),filtro=$('templatesStatus').value,lista=state.templates.filter(t=>(filtro==='all'||(filtro==='active'&&t.active!==false)||(filtro==='inactive'&&t.active===false))&&(!busca||normalizarTexto(t.name+' '+rotuloTipo(t.type)).includes(busca))).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));$('templatesSummary').innerHTML='<strong>'+lista.length+'</strong> exibido(s) · <strong>'+state.templates.filter(t=>t.active!==false).length+'</strong> ativo(s)';box.replaceChildren();if(!lista.length){const e=document.createElement('div');e.className='empty-state';e.textContent=state.templates.length?'Nenhum modelo corresponde aos filtros.':'Nenhum modelo personalizado salvo.';box.appendChild(e);return;}lista.forEach(t=>{const card=document.createElement('article');card.className='template-card'+(t.active===false?' is-inactive':'');const h=document.createElement('h3');h.textContent=t.name;const p=document.createElement('p');p.textContent=rotuloTipo(t.type)+' · '+(t.active===false?'inativo':'ativo')+' · criado em '+dataHora(t.createdAt);const actions=document.createElement('div');actions.className='contact-actions';if(t.active!==false)actions.append(botaoHistorico('Usar modelo',()=>{selecionarTipoDocumento(t.type,{ignorarConfirmacao:true});$('docTemplate').value=t.id;aplicarModeloSelecionado();ativarView('new');},'primary'));actions.append(botaoHistorico(t.active===false?'Reativar':'Inativar',()=>{const templates=state.templates.map(x=>x.id===t.id?{...x,active:t.active===false,updatedAt:new Date().toISOString()}:x);if(persistir({...state,templates})){renderModelos();atualizarOpcoesModelos();}},t.active===false?'':'danger'),botaoHistorico('Excluir',()=>{if(confirm('Excluir definitivamente o modelo “'+t.name+'”?')){const templates=state.templates.filter(x=>x.id!==t.id);if(persistir({...state,templates})){renderModelos();atualizarOpcoesModelos();atualizarVisaoSeguranca();}}},'danger'));card.append(h,p,actions);box.appendChild(card);});}
function nomePrincipalDocumento(r){const f=r.fields||{};if(r.type==='receipt')return r.tenant||'';if(r.type==='declaration')return f.docDeclarant||'';if(r.type==='term')return f.docPartyOne||'';if(r.type==='contract'){const sub=f.docContractSubtype;return sub==='sale'?(f.docBuyer||f.docSeller||''):(f.docTenantParty||f.docLandlord||'');}return '';}
function imovelDocumento(r){const f=r.fields||{};return r.type==='receipt'?r.property||'':r.type==='term'?f.docProperty||'':r.type==='contract'?f.docContractProperty||'':f.docSubject||'';}
function valorDocumento(r){if(r.type==='receipt')return Number(r.amount)||0;const v=String(r.fields&&r.fields.docContractValue||'');return Number.isFinite(parseValor(v))?parseValor(v):0;}
function referenciaDocumento(r){const f=r.fields||{};if(r.type==='receipt')return refValida(r.reference)?refTexto(r.reference):r.reference||'';return f.docTitle||rotuloTipo(r.type);}
function dataDocumento(r){return r.type==='receipt'?r.receiptDate:(r.fields&&r.fields.docDate)||'';}
function todosDocumentos(){const recibos=state.history.map(r=>({...r,type:'receipt',_kind:'receipt'})),outros=state.documents.map(r=>({...r,_kind:'document'})),rascunhos=state.draftDocuments.map(r=>({...r,status:'draft',_kind:'draft'}));if(state.draft)rascunhos.push({...state.draft,id:'receipt-draft',type:'receipt',status:'draft',year:Number(String(state.draft.receiptDate||hoje()).slice(0,4)),number:'',fields:{...state.draft},createdAt:state.draft.savedAt||'',_kind:'receipt-draft'});return [...recibos,...outros,...rascunhos];}
function correspondeBusca(r,busca){
  if(!busca) return true;
  const f=r.fields||{},texto=normalizarTexto([
    r.number,rotuloTipo(r.type),rotuloStatus(statusDocumento(r)),nomePrincipalDocumento(r),imovelDocumento(r),referenciaDocumento(r),
    r.tenant,r.cpf,String(r.cpf||'').replace(/\D/g,''),r.property,r.contractCode,r.reference,r.payment,r.operator,r.canceledBy,
    ...Object.values(f).filter(v=>typeof v==='string'),dataHora(r.createdAt||r.updatedAt)
  ].join(' '));
  return texto.includes(busca);
}
function renderFiltroAnos(){
  const sel=$('historyYear'),atual=sel.value||'all';
  const anos=[...new Set(todosDocumentos().map(r=>Number(r.year)||Number(String(dataDocumento(r)).slice(0,4))).filter(Number.isInteger))].sort((a,b)=>b-a);
  sel.replaceChildren();
  const todos=document.createElement('option');todos.value='all';todos.textContent='Todos os anos';sel.appendChild(todos);
  anos.forEach(ano=>{const op=document.createElement('option');op.value=String(ano);op.textContent=String(ano);sel.appendChild(op);});
  sel.value=anos.includes(Number(atual))?atual:'all';
}
function registrosFiltrados(){
  const busca=normalizarTexto($('historySearch').value),filtro=$('historyStatus').value;
  const tipo=$('historyType').value,ano=$('historyYear').value,pagamento=$('historyPayment').value,ordem=$('historySort').value;
  const registros=todosDocumentos().filter(r=>
    (tipo==='all'||r.type===tipo)&&(filtro==='all'||statusDocumento(r)===filtro)&&
    (ano==='all'||String(Number(r.year)||Number(String(dataDocumento(r)).slice(0,4)))===ano)&&
    (pagamento==='all'||(r.type==='receipt'&&r.payment===pagamento))&&correspondeBusca(r,busca)
  );
  const numeroPartes=r=>{const m=String(r.number||'0/0').match(/(?:-|^)(\d+)\/(\d{4})$/);return m?[Number(m[2]),Number(m[1])]:[0,0];};
  registros.sort((a,b)=>{if(ordem==='tenantAsc')return nomePrincipalDocumento(a).localeCompare(nomePrincipalDocumento(b),'pt-BR');if(ordem==='amountDesc')return valorDocumento(b)-valorDocumento(a);if(ordem==='referenceDesc')return referenciaDocumento(b).localeCompare(referenciaDocumento(a),'pt-BR');if(ordem==='numberDesc'){const na=numeroPartes(a),nb=numeroPartes(b);return nb[0]-na[0]||nb[1]-na[1];}return (new Date(b.createdAt||b.updatedAt||dataDocumento(b)).getTime()||0)-(new Date(a.createdAt||a.updatedAt||dataDocumento(a)).getTime()||0);});return registros;
}
function renderHistorico(){
  renderFiltroAnos();
  const box=$('historyList'),registros=registrosFiltrados();
  const totalPaginas=Math.max(1,Math.ceil(registros.length/PAGE_SIZE));
  historyPage=Math.min(Math.max(1,historyPage),totalPaginas);
  const pagina=registros.slice((historyPage-1)*PAGE_SIZE,historyPage*PAGE_SIZE);
  box.replaceChildren();
  const emitidos=registros.filter(r=>statusDocumento(r)==='issued'),cancelados=registros.filter(r=>statusDocumento(r)==='canceled').length,rascunhos=registros.filter(r=>statusDocumento(r)==='draft').length,arquivados=registros.filter(r=>statusDocumento(r)==='archived').length;
  const total=emitidos.filter(r=>r.type==='receipt').reduce((s,r)=>s+(Number(r.amount)||0),0);
  $('historySummary').innerHTML='<strong>'+registros.length+'</strong> documento(s) · <strong>'+emitidos.length+'</strong> emitido(s) · <strong>'+rascunhos+'</strong> rascunho(s) · <strong>'+cancelados+'</strong> cancelado(s) · <strong>'+arquivados+'</strong> arquivado(s) · recibos válidos: <strong>'+moeda(total)+'</strong>';
  $('historyPageInfo').textContent='Página '+historyPage+' de '+totalPaginas;
  $('historyPrevBtn').disabled=historyPage<=1;
  $('historyNextBtn').disabled=historyPage>=totalPaginas;
  if(!registros.length){
    const d=document.createElement('div');d.className='empty-state';
    d.textContent=todosDocumentos().length?'Nenhum documento corresponde à pesquisa.':'Nenhum documento registrado ainda.';
    box.appendChild(d);return;
  }
  pagina.forEach(r=>{
    const situacao=statusDocumento(r),canceled=situacao==='canceled';
    const item=document.createElement('div');item.className='history-item'+(canceled?' is-canceled':'');
    const numero=document.createElement('div');numero.className='history-number';numero.textContent=String(r.number||'Rascunho');const tipo=document.createElement('span');tipo.className='history-type-label';tipo.textContent=rotuloTipo(r.type);numero.appendChild(tipo);const status=document.createElement('div');status.className='history-status';const badgeTipo=document.createElement('span');badgeTipo.className='status-badge '+r.type;badgeTipo.textContent=rotuloTipo(r.type);const badge=document.createElement('span');badge.className='status-badge '+situacao;badge.textContent=rotuloStatus(situacao);status.append(badgeTipo,badge);const pessoa=document.createElement('div');pessoa.className='history-person';const nome=document.createElement('strong'),imovel=document.createElement('span');nome.textContent=nomePrincipalDocumento(r)||'Sem pessoa principal';imovel.textContent=imovelDocumento(r)||'Sem imóvel/assunto';pessoa.append(nome,imovel);const referencia=document.createElement('div');referencia.className='history-reference history-cell-muted';referencia.textContent=referenciaDocumento(r)+(r.type==='receipt'?' · '+String(r.payment||''):'');const emissao=document.createElement('div');emissao.className='history-issued history-cell-muted';emissao.textContent=situacao==='draft'?'Salvo '+dataHora(r.updatedAt||r.createdAt):dataHora(r.createdAt);const valor=document.createElement('div');valor.className='history-amount';valor.textContent=valorDocumento(r)>0?moeda(valorDocumento(r)):'—';const actionCell=document.createElement('div');actionCell.className='history-actions-cell';const menu=document.createElement('details');menu.className='history-menu';const resumo=document.createElement('summary');resumo.textContent='Ações';resumo.setAttribute('aria-label','Ações do documento '+(r.number||'em rascunho'));const lista=document.createElement('div');lista.className='history-menu-list';if(r.type==='receipt'){if(r.status==='draft'){lista.append(botaoHistorico('Editar rascunho',()=>{selecionarTipoDocumento('receipt',{ignorarConfirmacao:true});activeRecord=null;pendingIssue=null;travar(false);restaurarRascunho();atualizar();ativarView('new');}));}else{lista.append(botaoHistorico('Visualizar',()=>{selecionarTipoDocumento('receipt',{ignorarConfirmacao:true});carregar(r);}),botaoHistorico('Gerar próximo mês',()=>{selecionarTipoDocumento('receipt',{ignorarConfirmacao:true});criarRascunhoDe(r,true);ativarView('new');}),botaoHistorico('Duplicar',()=>{selecionarTipoDocumento('receipt',{ignorarConfirmacao:true});criarRascunhoDe(r,false);ativarView('new');}),botaoHistorico('Imprimir novamente',()=>{selecionarTipoDocumento('receipt',{ignorarConfirmacao:true});imprimirRegistro(r);}));if(!canceled)lista.append(botaoHistorico('Cancelar recibo',()=>abrirCancelamento(r.number),'danger'));}}else if(r._kind==='draft'){lista.append(botaoHistorico('Editar rascunho',()=>carregarDocumentoGenerico(r)),botaoHistorico('Duplicar',()=>carregarDocumentoGenerico(r,{duplicar:true})),botaoHistorico('Excluir rascunho',()=>excluirRascunhoGenerico(r.id),'danger'));}else{lista.append(botaoHistorico('Visualizar',()=>carregarDocumentoGenerico(r)),botaoHistorico('Duplicar',()=>carregarDocumentoGenerico(r,{duplicar:true})),botaoHistorico('Imprimir novamente',()=>{if(carregarDocumentoGenerico(r))setTimeout(imprimirDocumentoGenerico,0);}));if(situacao==='issued')lista.append(botaoHistorico('Cancelar',()=>cancelarDocumentoGenerico(r.id),'danger'),botaoHistorico('Arquivar',()=>arquivarDocumentoGenerico(r.id)));}menu.append(resumo,lista);actionCell.appendChild(menu);item.title='Tipo: '+rotuloTipo(r.type)+' · Responsável: '+String(r.operator||r.fields&&r.fields.docOperator||'Não registrado')+(r.cancelReason?' · Motivo: '+r.cancelReason:'');item.append(numero,status,pessoa,referencia,emissao,valor,actionCell);box.appendChild(item);
    badgeTipo.classList.remove(r.type);
    badgeTipo.classList.add('type-'+r.type);
  });
}
function carregar(r){
  if(!confirmarDescartarRascunho()) return false;
  const erros=validarDados(r);
  if(Object.keys(erros).length){toast('Este registro contém dados inválidos e não pode ser carregado.',true);return false;}
  activeRecord=Object.freeze({...r,status:statusRegistro(r)});
  preencherFormulario(activeRecord);
  draftDirty=false;travar(true);mostrarErros({});ativarView('new');atualizar();
  toast('Recibo '+r.number+' carregado para consulta ou reimpressão.');
  return true;
}
function imprimirRegistro(r){if(carregar(r))setTimeout(imprimir,0);}
function abrirModal(id){lastModalTrigger=document.activeElement;$(id).hidden=false;document.body.style.overflow='hidden';}
function fecharModal(id){
  $(id).hidden=true;
  if($('confirmModal').hidden&&$('cancelModal').hidden){document.body.style.overflow='';if(lastModalTrigger&&document.contains(lastModalTrigger))lastModalTrigger.focus();lastModalTrigger=null;}
}
function manterFocoNoModal(evento){if(evento.key!=='Tab')return;const modal=!$('confirmModal').hidden?$('confirmModal'):!$('cancelModal').hidden?$('cancelModal'):null;if(!modal)return;const focaveis=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);if(!focaveis.length)return;const primeiro=focaveis[0],ultimo=focaveis[focaveis.length-1];if(evento.shiftKey&&document.activeElement===primeiro){evento.preventDefault();ultimo.focus();}else if(!evento.shiftKey&&document.activeElement===ultimo){evento.preventDefault();primeiro.focus();}}
function emitir(){
  if(activeRecord) return;
  if(storageCorrupted){toast('Resolva o aviso de recuperação antes de emitir.',true);return;}
  state=lerEstado();
  const d=dadosFormulario(),erros=validarDados(d);
  if(!mostrarErros(erros)){toast('Confira os campos indicados antes de emitir.',true);return;}
  atualizar();
  if(!conteudoCabeEmUmaPagina()&&!confirm('O conteúdo pode ultrapassar uma página A4. Deseja continuar mesmo assim?')) return;
  if(state.history.some(r=>r.number===d.number)){
    atualizar();toast('A numeração foi atualizada. Confira o novo número e tente novamente.',true);return;
  }
  pendingIssue={...d};
  $('confirmNumber').textContent=d.number;
  $('confirmTenant').textContent=d.tenant+' — '+tipoDocumento(d.cpf)+' '+d.cpf;
  $('confirmAmount').textContent=moeda(d.amount);
  $('confirmProperty').textContent=d.property;
  $('confirmReference').textContent=refTexto(d.reference);
  $('confirmPayment').textContent=d.payment;
  $('confirmOperator').textContent=d.operator;
  $('confirmInternal').textContent=(d.contractCode||'Sem código')+(d.dueDay?' · vencimento dia '+d.dueDay:'');
  abrirModal('confirmModal');$('confirmIssueBtn').focus();
}
function confirmarEmissao(){
  if(!pendingIssue) return;
  state=lerEstado();
  const d={...pendingIssue};
  if(state.history.some(r=>r.number===d.number)){
    pendingIssue=null;fecharModal('confirmModal');atualizar();
    toast('Outro recibo utilizou esse número. Confira a numeração atualizada.',true);return;
  }
  const erros=validarDados(d);
  if(Object.keys(erros).length){
    pendingIssue=null;fecharModal('confirmModal');mostrarErros(erros);
    toast('Os dados mudaram ou deixaram de ser válidos. Confira novamente.',true);return;
  }
  const registro={...d,type:'receipt',templateVersion:1,letterhead:'institutional',fields:{...d},status:'issued',createdAt:new Date().toISOString(),issuedOn:state.meta.installationId,printCount:0,lastPrintedAt:''};
  const k=String(d.year);
  const contacts=upsertContato(state.contacts,d);
  const next={
    counters:{...state.counters,[k]:Math.max(proxSeq(d.year),Number(d.number.split('/')[0])+1)},
    history:[...state.history,registro],contacts,
    draft:null,management:state.management||{},meta:{...state.meta,defaultOperator:d.operator}
  };
  if(!persistir(next)) return;
  pendingIssue=null;fecharModal('confirmModal');
  activeRecord=Object.freeze({...registro});draftDirty=false;
  preencherFormulario(activeRecord);travar(true);renderCadastros();renderHistorico();atualizar();
  toast('Recibo '+d.number+' emitido e registrado.');
}
function abrirCancelamento(number){
  const r=state.history.find(x=>x.number===number);
  if(!r||statusRegistro(r)==='canceled') return;
  cancelTargetNumber=number;$('cancelReason').value='';$('cancelReasonError').textContent='';
  $('cancelOperator').value=operadores.includes($('operator').value)?$('operator').value:(state.meta.defaultOperator||operadores[0]);
  $('cancelReason').setAttribute('aria-invalid','false');
  abrirModal('cancelModal');$('cancelReason').focus();
}
function fecharCancelamento(){
  cancelTargetNumber=null;fecharModal('cancelModal');
}
function confirmarCancelamento(){
  const motivo=$('cancelReason').value.trim();
  const responsavel=$('cancelOperator').value;
  if(!operadores.includes(responsavel)){toast('Selecione o responsável pelo cancelamento.',true);return;}
  if(motivo.length<3){
    $('cancelReasonError').textContent='Informe um motivo com pelo menos 3 caracteres.';
    $('cancelReason').setAttribute('aria-invalid','true');$('cancelReason').focus();return;
  }
  state=lerEstado();
  const atual=state.history.find(r=>r.number===cancelTargetNumber);
  if(!atual){fecharCancelamento();toast('O recibo não foi encontrado.',true);return;}
  if(statusRegistro(atual)==='canceled'){fecharCancelamento();renderHistorico();toast('Este recibo já está cancelado.',true);return;}
  const canceledAt=new Date().toISOString();
  const history=state.history.map(r=>r.number===cancelTargetNumber?
    {...r,status:'canceled',cancelReason:motivo,canceledAt,canceledBy:responsavel}:r);
  if(!persistir({...state,history})) return;
  const number=cancelTargetNumber;fecharCancelamento();
  if(activeRecord&&activeRecord.number===number){
    activeRecord=Object.freeze({...activeRecord,status:'canceled',cancelReason:motivo,canceledAt,canceledBy:responsavel});
  }
  renderHistorico();atualizar();toast('Recibo '+number+' cancelado e mantido no histórico.');
}
function ajustarNumero(){
  if(activeRecord) return;
  const ano=anoSel(),atual=proxSeq(ano);
  const resp=prompt('Informe o próximo número sequencial para '+ano+':',String(atual));
  if(resp===null) return;
  if(!/^\d+$/.test(resp.trim())||Number(resp)<atual||Number(resp)>9999999){
    toast('Informe um número inteiro de '+atual+' a 9.999.999.',true);return;
  }
  const n=Number(resp);
  if(persistir({...state,counters:{...state.counters,[String(ano)]:n}})){
    atualizar();toast('Próximo recibo definido como '+nro(ano,n)+'.');
  }
}
function payloadBackup(estado,exportedAt=new Date().toISOString()){
  return {app:'Gerador de Documentos - Paraíba Imóveis',version:SCHEMA_VERSION,exportedAt,state:estado};
}
function baixarBackupEstado(estado,prefixo='backup-documentos'){
  baixarBlob(new Blob([JSON.stringify(payloadBackup(estado),null,2)],{type:'application/json'}),prefixo+'-'+hoje()+'.json');
}
function estadoComBackupRegistrado(){
  const agora=new Date().toISOString();
  return {...state,meta:{...state.meta,lastBackupAt:agora,schemaVersion:SCHEMA_VERSION}};
}
function exportarBackup(){
  if(storageCorrupted){baixarDadosRecuperacao();return;}
  const next=estadoComBackupRegistrado();
  if(!persistir(next))return;
  baixarBackupEstado(state);atualizarBackupStatus();toast('Backup exportado e data de segurança atualizada.');
}
function bytesParaBase64(bytes){
  let bin='';for(let i=0;i<bytes.length;i+=8192)bin+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(bin);
}
function base64ParaBytes(valor){
  const bin=atob(valor),bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes;
}
async function chaveBackup(senha,salt,uso){
  const enc=new TextEncoder(),material=await crypto.subtle.importKey('raw',enc.encode(senha),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:180000,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,[uso]);
}
async function exportarBackupProtegido(){
  if(storageCorrupted){baixarDadosRecuperacao();return;}
  if(!globalThis.crypto||!crypto.subtle){toast('Este navegador não oferece criptografia para o backup.',true);return;}
  const senha=prompt('Crie uma senha com pelo menos 8 caracteres para proteger o backup:');
  if(senha===null)return;
  if(senha.length<8){toast('A senha precisa ter pelo menos 8 caracteres.',true);return;}
  const confirmacao=prompt('Repita a senha do backup protegido:');
  if(confirmacao!==senha){toast('As senhas não coincidem.',true);return;}
  try{
    const next=estadoComBackupRegistrado(),salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
    const key=await chaveBackup(senha,salt,'encrypt');
    const dados=new TextEncoder().encode(JSON.stringify(payloadBackup(next)));
    const cifrado=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,dados));
    const envelope={app:'Gerador de Documentos - Paraíba Imóveis',version:SCHEMA_VERSION,encrypted:true,
      algorithm:'AES-GCM',kdf:'PBKDF2-SHA256',iterations:180000,salt:bytesParaBase64(salt),iv:bytesParaBase64(iv),data:bytesParaBase64(cifrado)};
    if(!persistir(next))return;
    baixarBlob(new Blob([JSON.stringify(envelope)],{type:'application/json'}),'backup-documentos-protegido-'+hoje()+'.documentos');
    atualizarBackupStatus();toast('Backup protegido por senha exportado.');
  }catch(e){toast('Não foi possível gerar o backup protegido.',true);}
}
async function abrirBackupProtegido(envelope){
  if(!envelope||envelope.encrypted!==true)return envelope;
  if(!globalThis.crypto||!crypto.subtle)throw new Error('Este navegador não consegue abrir backups protegidos.');
  const senha=prompt('Digite a senha deste backup protegido:');
  if(senha===null)throw new Error('Importação cancelada.');
  try{
    const salt=base64ParaBytes(envelope.salt),iv=base64ParaBytes(envelope.iv),dados=base64ParaBytes(envelope.data);
    const key=await chaveBackup(senha,salt,'decrypt');
    const aberto=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,dados);
    return JSON.parse(new TextDecoder().decode(aberto));
  }catch(e){throw new Error('Senha incorreta ou backup protegido inválido.');}
}
function conteudoBase(r){
  return JSON.stringify([r.number,Number(r.year),Number(r.amount),r.tenant,r.cpf,r.property,r.contractCode||'',Number(r.dueDay)||0,r.reference,r.payment,r.receiptDate,r.operator||'']);
}
function conteudoRegistro(r){
  return JSON.stringify([conteudoBase(r),statusRegistro(r),r.cancelReason||'',r.canceledAt||'',r.canceledBy||'']);
}
function normalizarContato(c){
  if(!c||typeof c!=='object') return null;
  const x={
    tenant:String(c.tenant||c.locatario||c.nome||c.name||'').trim(),
    cpf:mascaraDocumento(c.cpf||c.cnpj||c.documento||c.document||''),
    property:String(c.property||c.imovel||c.endereco||c.address||'').trim(),
    amount:Number.isFinite(Number(c.amount))&&Number(c.amount)>0?Number(c.amount):0,
    payment:pagamentos.includes(c.payment)?c.payment:'Dinheiro',
    contractCode:String(c.contractCode||c.codigoContrato||'').trim().slice(0,60),
    dueDay:Number.isInteger(Number(c.dueDay))&&Number(c.dueDay)>=1&&Number(c.dueDay)<=31?Number(c.dueDay):0,
    active:c.active!==false
  };
  if(!x.tenant||x.tenant.length>200||!documentoValido(x.cpf)||!x.property||x.property.length>1500) return null;
  return {...x,id:idContato(x),updatedAt:typeof c.updatedAt==='string'?c.updatedAt:''};
}
function normalizarBackup(payload){
  const fonte=payload&&payload.state?payload.state:payload;
  if(!fonte||typeof fonte!=='object'||!Array.isArray(fonte.history)||fonte.history.length>10000) throw new Error('Estrutura do backup inválida.');
  const counters={};
  for(const [ano,valor] of Object.entries(fonte.counters&&typeof fonte.counters==='object'?fonte.counters:{})){
    if(!/^\d{4}$/.test(ano)||!Number.isInteger(Number(valor))||Number(valor)<1||Number(valor)>9999999)
      throw new Error('Numeração inválida no backup.');
    counters[ano]=Number(valor);
  }
  const history=fonte.history.map(r=>{
    if(!r||typeof r!=='object') throw new Error('Registro inválido no backup.');
    const d={
      number:String(r.number||''),year:Number(r.year),amount:Number(r.amount),
      tenant:String(r.tenant||''),cpf:mascaraDocumento(r.cpf||r.cnpj||''),property:String(r.property||''),
      contractCode:String(r.contractCode||'').slice(0,60),dueDay:Number(r.dueDay)||0,
      reference:String(r.reference||''),payment:String(r.payment||''),receiptDate:String(r.receiptDate||''),
      operator:operadores.includes(r.operator)?r.operator:operadores[0]
    };
    if(Object.keys(validarDados(d)).length) throw new Error('Há recibos com dados inválidos no backup.');
    const status=statusRegistro(r);
    const cancelReason=String(r.cancelReason||'').trim();
    if(status==='canceled'&&cancelReason.length<3) throw new Error('Há recibo cancelado sem motivo válido no backup.');
    return {...d,type:'receipt',templateVersion:1,letterhead:'institutional',fields:{...d},amountWords:ajustarAcentos(valorExtenso(d.amount)),status,
      createdAt:typeof r.createdAt==='string'?r.createdAt:'',
      cancelReason:status==='canceled'?cancelReason:'',
      canceledAt:status==='canceled'&&typeof r.canceledAt==='string'?r.canceledAt:'',
      canceledBy:status==='canceled'&&operadores.includes(r.canceledBy)?r.canceledBy:'',
      issuedOn:typeof r.issuedOn==='string'?r.issuedOn:'',
      printCount:Math.max(0,Number(r.printCount)||0),lastPrintedAt:typeof r.lastPrintedAt==='string'?r.lastPrintedAt:''};
  });
  const unicos=new Map();
  for(const r of history){
    if(unicos.has(r.number)&&conteudoRegistro(unicos.get(r.number))!==conteudoRegistro(r))
      throw new Error('O backup contém números repetidos com conteúdos diferentes: '+r.number+'.');
    unicos.set(r.number,r);
  }
  const contatosOriginais=Array.isArray(fonte.contacts)?fonte.contacts:[];
  const contacts=normalizarCadastros(contatosOriginais);
  const documentCounters=fonte.documentCounters&&typeof fonte.documentCounters==='object'?fonte.documentCounters:{};
  const documents=(Array.isArray(fonte.documents)?fonte.documents:[]).map(r=>normalizarDocumentoGenerico(r)).filter(Boolean);
  const draftDocuments=(Array.isArray(fonte.draftDocuments)?fonte.draftDocuments:[]).map(r=>normalizarDocumentoGenerico(r,{draft:true})).filter(Boolean);
  const templates=normalizarModelos(fonte.templates);
  const docNumbers=new Set();for(const d of documents){if(!d.number||docNumbers.has(d.number))throw new Error('Há documentos com numeração ausente ou repetida no backup.');if(Object.keys(validarDocumentoGenerico(d)).length)throw new Error('Há '+rotuloTipo(d.type).toLowerCase()+' com campos obrigatórios inválidos no backup.');docNumbers.add(d.number);}
  return {counters,documentCounters,history:[...unicos.values()],documents,draftDocuments,templates,contacts,draft:normalizarRascunho(fonte.draft),management:fonte.management&&typeof fonte.management==='object'?fonte.management:{},meta:metaNormalizada(fonte.meta),
    _importStats:{ignoredContacts:Math.max(0,contatosOriginais.length-contacts.length)}};
}
function importarBackup(file){
  if(file.size>8*1024*1024){toast('O backup ultrapassa 8 MB.',true);return;}
  const reader=new FileReader();
  reader.onload=async()=>{
    try{
      const aberto=await abrirBackupProtegido(JSON.parse(reader.result));
      const incoming=normalizarBackup(aberto);
      let history=state.history.slice(),novos=0,atualizados=0;
      const indices=new Map(history.map((r,i)=>[r.number,i]));
      for(const r of incoming.history){
        const idx=indices.get(r.number);
        if(idx===undefined){indices.set(r.number,history.length);history.push(r);novos++;continue;}
        const atual=history[idx];
        if(conteudoBase(atual)!==conteudoBase(r))
          throw new Error('Conflito no recibo '+r.number+': o número já existe com outros dados. Nada foi importado.');
        if(statusRegistro(r)==='canceled'&&statusRegistro(atual)!=='canceled'){history[idx]=r;atualizados++;}
      }
      const contacts=state.contacts.slice(),contactIds=new Set(contacts.map(c=>c.id));
      let novosCadastros=0;
      incoming.contacts.forEach(c=>{if(!contactIds.has(c.id)){contacts.push(c);contactIds.add(c.id);novosCadastros++;}});
      const documents=state.documents.slice(),documentIds=new Set(documents.map(d=>d.id)),documentNumbers=new Set(documents.map(d=>d.number));let novosDocumentos=0;
      incoming.documents.forEach(d=>{if(documentNumbers.has(d.number)&&!documents.some(x=>x.number===d.number&&JSON.stringify(x.fields)===JSON.stringify(d.fields)))throw new Error('Conflito no documento '+d.number+'. Nada foi importado.');if(!documentIds.has(d.id)&&!documentNumbers.has(d.number)){documents.push(d);documentIds.add(d.id);documentNumbers.add(d.number);novosDocumentos++;}});
      const draftDocuments=state.draftDocuments.slice(),draftIds=new Set(draftDocuments.map(d=>d.id));incoming.draftDocuments.forEach(d=>{if(!draftIds.has(d.id)){draftDocuments.push(d);draftIds.add(d.id);}});
      const templates=state.templates.slice(),templateIds=new Set(templates.map(t=>t.id));incoming.templates.forEach(t=>{if(!templateIds.has(t.id)){templates.push(t);templateIds.add(t.id);}});
      const counters={...state.counters};
      for(const [ano,n] of Object.entries(incoming.counters)) counters[ano]=Math.max(Number(counters[ano])||1,n);
      history.forEach(r=>{
        const ano=String(r.year);
        counters[ano]=Math.max(Number(counters[ano])||1,Number(r.number.split('/')[0])+1);
      });
      const documentCounters={...state.documentCounters};for(const [chave,n] of Object.entries(incoming.documentCounters||{}))documentCounters[chave]=Math.max(Number(documentCounters[chave])||1,Number(n)||1);documents.forEach(d=>{const chave=chaveContadorDocumento(d.type,d.year),m=String(d.number).match(/-(\d+)\//);documentCounters[chave]=Math.max(Number(documentCounters[chave])||1,(m?Number(m[1]):0)+1);});
      const ignorados=incoming._importStats.ignoredContacts;
      const resumo=novos+' recibo(s), '+novosDocumentos+' outro(s) documento(s), '+atualizados+' cancelamento(s) atualizado(s), '+novosCadastros+' cadastro(s) novo(s)'+(ignorados?' e '+ignorados+' cadastro(s) inválido(s) ignorado(s)':'');
      if(!confirm('Importar '+resumo+'? O histórico atual será preservado.')) return;
      const seguranca={...state,meta:{...state.meta,lastBackupAt:new Date().toISOString()}};
      baixarBackupEstado(seguranca,'backup-antes-importacao');
      if(!persistir({counters,documentCounters,history,documents,draftDocuments,templates,contacts,draft:state.draft||incoming.draft,management:incoming.management&&Object.keys(incoming.management).length?incoming.management:state.management,meta:seguranca.meta})) return;
      historyPage=1;renderCadastros();renderHistorico();renderModelos();atualizar();if(currentDocumentType!=='receipt')atualizarDocumentoGenerico();toast('Backup importado: '+resumo+'.');
    }catch(e){toast('Não foi possível importar. '+(e.message||'Arquivo inválido.'),true);}
    finally{$('importFile').value='';}
  };
  reader.onerror=()=>{toast('Não foi possível ler o arquivo.',true);$('importFile').value='';};
  reader.readAsText(file);
}
function celulaCSV(valor){return '"'+String(valor??'').replace(/"/g,'""')+'"';}
function exportarHistoricoCSV(){
  const registros=registrosFiltrados();
  if(!registros.length){toast('Não há documentos nos filtros atuais para exportar.',true);return;}
  const cabecalho=['Número','Tipo','Situação','Data do documento','Data de emissão','Título/Referência','Pessoa principal','Imóvel/assunto','Valor','Pagamento','Responsável','Timbre','Cancelado em','Cancelado por','Motivo','Quantidade de impressões','Última impressão'];
  const linhas=registros.map(r=>[
    r.number||'',rotuloTipo(r.type),rotuloStatus(statusDocumento(r)),dataDocumento(r),r.createdAt||r.updatedAt||'',referenciaDocumento(r),nomePrincipalDocumento(r),imovelDocumento(r),valorDocumento(r)?valorCampo(valorDocumento(r)):'',r.payment||'',r.operator||r.fields&&r.fields.docOperator||'',r.letterhead||'',r.canceledAt||'',r.canceledBy||'',r.cancelReason||'',r.printCount||0,r.lastPrintedAt||''
  ]);
  const csv='\uFEFF'+[cabecalho,...linhas].map(l=>l.map(celulaCSV).join(';')).join('\r\n');
  baixarBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),'historico-documentos-'+hoje()+'.csv');
  toast(registros.length+' documento(s) exportado(s) em CSV.');
}
function nomeArquivoRecibo(r){
  const numero=String(r.number||'').replace('/','-');
  const nome=normalizarTexto(r.tenant).split(' ').filter(Boolean).slice(0,4)
    .map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join('_')||'Locatario';
  const [a,m]=String(r.reference||'').split('-').map(Number);
  const referencia=a&&m?(meses[m-1].charAt(0).toUpperCase()+meses[m-1].slice(1)+'-'+a):'Sem-referencia';
  return 'Recibo_'+(statusRegistro(r)==='canceled'?'CANCELADO_':'')+numero+'_'+nome+'_'+referencia;
}
function registrarImpressao(number){
  state=lerEstado();
  const impressoEm=new Date().toISOString();
  const history=state.history.map(r=>r.number===number?{...r,printCount:(Number(r.printCount)||0)+1,lastPrintedAt:impressoEm}:r);
  if(!persistir({...state,history}))return;
  if(activeRecord&&activeRecord.number===number){
    const atualizado=history.find(r=>r.number===number);activeRecord=Object.freeze({...atualizado});
  }
  renderHistorico();
}
function imprimir(){
  if(!activeRecord){toast('Emita e registre o recibo antes de imprimir.',true);return;}
  if(Object.keys(validarDados(activeRecord)).length){toast('O registro não está válido para impressão.',true);return;}
  if(!conteudoCabeEmUmaPagina()&&!confirm('O recibo pode ultrapassar uma página A4. Deseja abrir a impressão mesmo assim?'))return;
  const tituloAnterior=document.title,nome=nomeArquivoRecibo(activeRecord);
  document.title=nome;atualizar();
  let restaurado=false;
  const restaurar=()=>{if(restaurado)return;restaurado=true;document.title=tituloAnterior;};
  const number=activeRecord.number;
  window.addEventListener('afterprint',()=>{registrarImpressao(number);restaurar();},{once:true});
  setTimeout(restaurar,5000);
  toast('Nome sugerido para o PDF: '+nome+'.pdf');
  window.print();
}
function inputFormulario(id){
  limparErroCampo(id);
  if(!activeRecord)draftDirty=true;
  if(['tenant','cpf','property'].includes(id)){
    const selecionado=$('savedTenant').value||editingContactId;
    if(selecionado){$('savedTenant').value=selecionado;$('deleteContactBtn').disabled=false;$('savedTenantStatus').textContent='Dados alterados. Clique em “Salvar cadastro” para atualizar o registro selecionado.';}else{$('deleteContactBtn').disabled=true;$('savedTenantStatus').textContent='Dados informados manualmente. Salve para criar um novo cadastro.';}
  }
  atualizar();
}
$('amount').addEventListener('input',()=>inputFormulario('amount'));
$('amount').addEventListener('blur',()=>{
  const n=parseValor($('amount').value);
  if(Number.isFinite(n)&&n>0)$('amount').value=valorCampo(n);
  atualizar();
});
$('tenant').addEventListener('input',()=>inputFormulario('tenant'));
$('cpf').addEventListener('input',e=>{e.target.value=mascaraDocumento(e.target.value);inputFormulario('cpf');});
$('property').addEventListener('input',()=>inputFormulario('property'));
$('contractCode').addEventListener('input',()=>inputFormulario('contractCode'));
$('dueDay').addEventListener('input',()=>inputFormulario('dueDay'));
$('reference').addEventListener('change',()=>inputFormulario('reference'));
$('payment').addEventListener('change',()=>inputFormulario('payment'));
$('receiptDate').addEventListener('change',()=>inputFormulario('receiptDate'));
$('operator').addEventListener('change',()=>inputFormulario('operator'));
$('savedTenant').addEventListener('change',selecionarCadastro);
$('saveContactBtn').addEventListener('click',salvarCadastro);
$('deleteContactBtn').addEventListener('click',excluirCadastro);
$('clearBtn').addEventListener('click',limpar);
$('saveDraftBtn').addEventListener('click',salvarRascunho);
$('duplicateBtn').addEventListener('click',duplicar);
$('nextMonthBtn').addEventListener('click',gerarProximoMes);
$('printBtn').addEventListener('click',imprimir);
$('issueBtn').addEventListener('click',emitir);
$('genericNewBtn').addEventListener('click',()=>limparDocumentoGenerico());
$('genericSaveDraftBtn').addEventListener('click',salvarRascunhoGenerico);
$('genericSaveTemplateBtn').addEventListener('click',salvarModeloAtual);
$('genericIssueBtn').addEventListener('click',emitirDocumentoGenerico);
$('genericPrintBtn').addEventListener('click',imprimirDocumentoGenerico);
$('genericDuplicateBtn').addEventListener('click',duplicarDocumentoGenerico);
$('docQuickContact').addEventListener('change',aplicarCadastroDocumento);
$('docTemplate').addEventListener('change',aplicarModeloSelecionado);
document.querySelectorAll('[data-document-type]').forEach(btn=>btn.addEventListener('click',()=>selecionarTipoDocumento(btn.dataset.documentType)));
camposGenericosElementos().forEach(el=>{const evento=(el.tagName==='SELECT'||el.type==='checkbox'||el.type==='date')?'change':'input';el.addEventListener(evento,()=>{genericDirty=true;const err=$(el.id+'Error');if(err)err.textContent='';el.setAttribute('aria-invalid','false');if(el.id==='docTermSubtype'||el.id==='docContractSubtype'){const atual=String($('docTitle').value||'').toUpperCase();if(!atual||atual.startsWith('TERMO')||atual.startsWith('CONTRATO'))$('docTitle').value=tituloPadraoDocumento(currentDocumentType);atualizarCamposCondicionais();}atualizarDocumentoGenerico();});});
document.querySelectorAll('[data-clause]').forEach(el=>el.addEventListener('change',()=>{genericDirty=true;atualizarDocumentoGenerico();}));
['docDeclarantDocument','docPartyOneDocument','docPartyTwoDocument','docLandlordDocument','docTenantPartyDocument','docSellerDocument','docBuyerDocument','docWitnessOneDocument','docWitnessTwoDocument'].forEach(id=>$(id).addEventListener('input',e=>{e.target.value=mascaraDocumento(e.target.value);genericDirty=true;atualizarDocumentoGenerico();}));
$('confirmIssueBtn').addEventListener('click',confirmarEmissao);
$('cancelIssueBtn').addEventListener('click',()=>{pendingIssue=null;fecharModal('confirmModal');$('issueBtn').focus();});
$('closeCancelBtn').addEventListener('click',fecharCancelamento);
$('confirmCancelBtn').addEventListener('click',confirmarCancelamento);
$('cancelReason').addEventListener('input',()=>{
  $('cancelReasonError').textContent='';$('cancelReason').setAttribute('aria-invalid','false');
});
$('adjustNumber').addEventListener('click',ajustarNumero);
$('backupBtn').addEventListener('click',exportarBackup);
$('secureBackupBtn').addEventListener('click',exportarBackupProtegido);
$('importBtn').addEventListener('click',()=>$('importFile').click());
$('importFile').addEventListener('change',e=>{if(e.target.files&&e.target.files[0])importarBackup(e.target.files[0]);});
$('exportCsvBtn').addEventListener('click',exportarHistoricoCSV);
$('downloadRecoveryBtn').addEventListener('click',baixarDadosRecuperacao);
$('resetStorageBtn').addEventListener('click',iniciarHistoricoVazio);
$('historySearch').addEventListener('input',()=>{historyPage=1;renderHistorico();});
$('historyType').addEventListener('change',()=>{historyPage=1;renderHistorico();});
$('historyStatus').addEventListener('change',()=>{historyPage=1;renderHistorico();});
$('historyYear').addEventListener('change',()=>{historyPage=1;renderHistorico();});
$('historyPayment').addEventListener('change',()=>{historyPage=1;renderHistorico();});
$('historySort').addEventListener('change',()=>{historyPage=1;renderHistorico();});
$('clearHistoryFilters').addEventListener('click',()=>{$('historySearch').value='';$('historyType').value='all';$('historyStatus').value='all';$('historyYear').value='all';$('historyPayment').value='all';$('historySort').value='newest';historyPage=1;renderHistorico();});
$('historyFiltersToggle').addEventListener('click',()=>{const aberto=$('historyFilters').classList.toggle('is-open');$('historyFiltersToggle').setAttribute('aria-expanded',aberto?'true':'false');});
$('historyPrevBtn').addEventListener('click',()=>{if(historyPage>1){historyPage--;renderHistorico();}});
$('historyNextBtn').addEventListener('click',()=>{historyPage++;renderHistorico();});
$('contactsSearch').addEventListener('input',renderGerenciadorCadastros);$('contactsStatus').addEventListener('change',renderGerenciadorCadastros);$('clearContactsFilters').addEventListener('click',()=>{$('contactsSearch').value='';$('contactsStatus').value='all';renderGerenciadorCadastros();});
$('templatesSearch').addEventListener('input',renderModelos);$('templatesStatus').addEventListener('change',renderModelos);$('clearTemplatesFilters').addEventListener('click',()=>{$('templatesSearch').value='';$('templatesStatus').value='all';renderModelos();});$('newTemplateFromCurrentBtn').addEventListener('click',()=>{if(currentDocumentType==='receipt'){selecionarTipoDocumento('declaration',{ignorarConfirmacao:true});}salvarModeloAtual();});
$('newContactBtn').addEventListener('click',()=>{selecionarTipoDocumento('receipt',{ignorarConfirmacao:true});if(limpar()){ativarView('new');$('tenant').focus();$('savedTenantStatus').textContent='Informe os dados e clique em “Salvar cadastro”.';}});$('previewMobileBtn').addEventListener('click',abrirPreview);$('previewCloseBtn').addEventListener('click',()=>{fecharPreview();$('previewMobileBtn').focus();});$('genericPreviewCloseBtn').addEventListener('click',()=>{fecharPreview();$('previewMobileBtn').focus();});
document.querySelectorAll('.app-tabs [role="tab"]').forEach(tab=>{tab.addEventListener('click',()=>ativarView(tab.dataset.view));tab.addEventListener('keydown',e=>{const tabs=[...document.querySelectorAll('.app-tabs [role="tab"]')],i=tabs.indexOf(tab);let destino=-1;if(e.key==='ArrowRight')destino=(i+1)%tabs.length;else if(e.key==='ArrowLeft')destino=(i-1+tabs.length)%tabs.length;else if(e.key==='Home')destino=0;else if(e.key==='End')destino=tabs.length-1;if(destino>=0){e.preventDefault();ativarView(tabs[destino].dataset.view,{focar:true});}});});
$('confirmModal').addEventListener('click',e=>{
  if(e.target===$('confirmModal')){pendingIssue=null;fecharModal('confirmModal');}
});
$('cancelModal').addEventListener('click',e=>{if(e.target===$('cancelModal'))fecharCancelamento();});
document.addEventListener('keydown',e=>{
  manterFocoNoModal(e);
  if(e.key!=='Escape')return;
  if(!$('confirmModal').hidden){pendingIssue=null;fecharModal('confirmModal');}
  else if(!$('cancelModal').hidden)fecharCancelamento();
  else if(document.body.classList.contains('preview-open')){fecharPreview();$('previewMobileBtn').focus();}
});
document.addEventListener('click',e=>{document.querySelectorAll('.history-menu[open]').forEach(menu=>{if(!menu.contains(e.target))menu.open=false;});});
window.addEventListener('resize',ajustarAlturaMobile);
window.addEventListener('beforeunload',e=>{if((draftDirty&&!activeRecord)||(genericDirty&&!activeGenericRecord)){e.preventDefault();e.returnValue='';}});
window.addEventListener('storage',e=>{
  if(e.key!==KEY)return;
  state=lerEstado();
  if(activeRecord){
    const atualizado=state.history.find(r=>r.number===activeRecord.number);
    if(atualizado)activeRecord=Object.freeze({...atualizado});
    else{activeRecord=null;travar(false);}
  }
  if(!activeRecord&&!draftDirty&&state.draft)restaurarRascunho();
  renderCadastros();renderHistorico();renderModelos();atualizar();if(currentDocumentType!=='receipt'){atualizarCadastrosDocumento();atualizarOpcoesModelos();atualizarDocumentoGenerico();}
});
if('ResizeObserver'in window){const previewObserver=new ResizeObserver(ajustarAlturaMobile);previewObserver.observe($('receipt'));previewObserver.observe($('documentPreview'));previewObserver.observe(document.querySelector('.workspace'));}
$('receiptDate').value=hoje();
$('reference').value=mesAtual();
$('payment').value='Dinheiro';
$('operator').value=state.meta.defaultOperator||operadores[0];
$('historyType').value='all';$('historyStatus').value='all';$('historyYear').value='all';$('historyPayment').value='all';$('historySort').value='newest';$('contactsStatus').value='all';$('templatesStatus').value='all';
mostrarErros({});
if(migrationBackupCreated)persistir(state);
if(!restaurarRascunho())renderCadastros();
const logoDocumento=document.querySelector('#receipt .logo');if(logoDocumento){const clone=logoDocumento.cloneNode(true);clone.removeAttribute('class');$('documentLogoHost').appendChild(clone);}
limparDocumentoGenerico({preservarTipo:true});
renderHistorico();
renderModelos();
atualizarBackupStatus();
atualizar();
ativarView('new');
if(migrationBackupCreated)setTimeout(()=>toast('Dados atualizados com segurança para a versão 6.8.'),250);
})();
