/**
 * Euskara (eu-ES) template seed for M3 APPCC export.
 *
 * Per ADR-035; see `./es.ts` for the canonical key set + rationale.
 */
export const EU_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  'bundle.title': 'APPCC espedientea · {orgName}',
  'bundle.subtitle': '{from}etik {to}era',
  'bundle.generated_at': 'Sortuta: {at}',
  'bundle.generated_by': 'Egilea: {actor}',
  'bundle.template_version': 'Txantiloia {version}',
  'bundle.sha256': 'SHA-256 sinadura: {hash}',
  'bundle.audit_log_entry': 'audit_log sarrera: {auditLogId}',
  'cover.title': 'Espedientearen azala',
  'cover.contract':
    'Espedientean editatu gabeko audit_log dago 0. kapitulu gisa; gainerakoak erregistro horren gaineko ikuspegi egituratuak dira. Ez dugu laburpen exekutiborik egiten.',
  'cover.signed_by': 'Sinatzailea: {actor}',
  'cover.locale_label': 'Espedientearen hizkuntza: {locale}',
  'cover.scope_label': 'Esparrua: {scope}',
  'chapter.0.title': '0. kapitulua · Auditoria erregistro editatu gabea',
  'chapter.0.subtitle':
    'Eskatutako aldirako audit_log osoaren isurpena.',
  'chapter.haccp.title':
    'HACCP kapitulua · PCC irakurketak eta neurri zuzentzaileak',
  'chapter.haccp.subtitle':
    'Irismen barneko eta kanpoko irakurketak; lotutako neurri zuzentzaileak.',
  'chapter.lot.title': 'Trazagarritasun kapitulua · Loteen bizi-zikloa',
  'chapter.lot.subtitle': 'Harreratik kontsumora, lotez lote.',
  'chapter.procurement.title': 'Hornidura kapitulua · Erosketak eta harrerak',
  'chapter.procurement.subtitle':
    'Erosketa-aginduak, harrerak, ebatzitako desadostasunak.',
  'chapter.photo.title':
    'Argazki bidezko trazagarritasun kapitulua · Loteen eta produktuen jatorria',
  'chapter.photo.subtitle':
    'Argazki bidezko irensteak sortutako loteak eta produktuak.',
  'chapter.ai_obs.title': 'AA aztarna kapitulua · Erabilera eta kostua',
  'chapter.ai_obs.subtitle':
    'Erabilitako gaitasunak, ereduak, kostua orotara.',
  'table.haccp.header.timestamp': 'Data eta ordua',
  'table.haccp.header.ccp': 'PCC',
  'table.haccp.header.reading': 'Irakurketa',
  'table.haccp.header.range': 'Esparru onargarria',
  'table.haccp.header.in_spec': 'Esparruan',
  'table.haccp.header.actor': 'Operadorea',
  'table.haccp.header.corrective_action': 'Neurri zuzentzailea',
  'table.lot.header.lot_id': 'Lotea',
  'table.lot.header.supplier': 'Hornitzailea',
  'table.lot.header.received_at': 'Harrera',
  'table.lot.header.consumed_at': 'Kontsumoa',
  'table.lot.header.expiry': 'Iraungitze data',
  'table.procurement.header.po': 'Agindua',
  'table.procurement.header.gr': 'Harrera',
  'table.procurement.header.variance': 'Desadostasuna',
  'table.audit_log.header.event_type': 'Gertaera mota',
  'table.audit_log.header.actor': 'Eragilea',
  'table.audit_log.header.aggregate': 'Multzoa',
  'table.audit_log.header.created_at': 'Data',
  'signature.block.title': 'Sinaduren blokea',
  'signature.block.actor': 'Sinatzailea: {actor}, {at}',
  'signature.block.witness': 'Lekukoa: {witness}',
  'recipient.line': 'Bidalita {recipient}-(r)i',
  'recipient.list.heading': 'Hartzaileak',
  'empty.no_photos': 'Aldi honetan ez dago horniduraren argazkirik.',
  'empty.no_corrective_actions':
    'Aldi honetan ez dago neurri zuzentzaile erregistratu.',
  'footer.page': '{page}. orrialdea / {total}',
  'footer.legal':
    'nexandroek sortutako dokumentua · audit_log bidez trazagarria',
});
