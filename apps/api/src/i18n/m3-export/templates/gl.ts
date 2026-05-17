/**
 * Galego (gl-ES) template seed for M3 APPCC export.
 *
 * Per ADR-035; see `./es.ts` for the canonical key set + rationale.
 */
export const GL_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  'bundle.title': 'Expediente APPCC · {orgName}',
  'bundle.subtitle': 'Período {from} a {to}',
  'bundle.generated_at': 'Xerado o {at}',
  'bundle.generated_by': 'Xerado por {actor}',
  'bundle.template_version': 'Modelo {version}',
  'bundle.sha256': 'Sinatura SHA-256: {hash}',
  'bundle.audit_log_entry': 'Entrada audit_log: {auditLogId}',
  'cover.title': 'Portada do expediente',
  'cover.contract':
    'O expediente contén o audit_log sen editar como capítulo 0; o resto son vistas estruturadas sobre ese mesmo rexistro. Non producimos resumo executivo.',
  'cover.signed_by': 'Asinado por {actor}',
  'cover.locale_label': 'Idioma do expediente: {locale}',
  'cover.scope_label': 'Alcance: {scope}',
  'chapter.0.title': 'Capítulo 0 · Rexistro de auditoría sen editar',
  'chapter.0.subtitle':
    'Volcado completo de audit_log para o período solicitado.',
  'chapter.haccp.title':
    'Capítulo HACCP · Lecturas de PCC e accións correctivas',
  'chapter.haccp.subtitle':
    'Lecturas dentro e fóra de rango; accións correctivas vinculadas.',
  'chapter.lot.title': 'Capítulo Trazabilidade · Ciclo de vida do lote',
  'chapter.lot.subtitle': 'Recepción a consumo, por lote.',
  'chapter.procurement.title':
    'Capítulo Aprovisionamento · Compras e recepcións',
  'chapter.procurement.subtitle':
    'Ordes de compra, recepcións, discrepancias resoltas.',
  'chapter.photo.title':
    'Capítulo Trazabilidade de fotos · Orixe de lotes e produtos',
  'chapter.photo.subtitle':
    'Lotes e produtos xerados mediante inxesta por foto.',
  'chapter.ai_obs.title': 'Capítulo Pegada IA · Uso e custo',
  'chapter.ai_obs.subtitle':
    'Capacidades invocadas, modelos, custo agregado.',
  'table.haccp.header.timestamp': 'Data e hora',
  'table.haccp.header.ccp': 'PCC',
  'table.haccp.header.reading': 'Lectura',
  'table.haccp.header.range': 'Rango aceptable',
  'table.haccp.header.in_spec': 'En rango',
  'table.haccp.header.actor': 'Operario',
  'table.haccp.header.corrective_action': 'Acción correctiva',
  'table.lot.header.lot_id': 'Lote',
  'table.lot.header.supplier': 'Provedor',
  'table.lot.header.received_at': 'Recepción',
  'table.lot.header.consumed_at': 'Consumo',
  'table.lot.header.expiry': 'Caducidade',
  'table.procurement.header.po': 'Orde',
  'table.procurement.header.gr': 'Recepción',
  'table.procurement.header.variance': 'Discrepancia',
  'table.audit_log.header.event_type': 'Tipo de evento',
  'table.audit_log.header.actor': 'Actor',
  'table.audit_log.header.aggregate': 'Agregado',
  'table.audit_log.header.created_at': 'Data',
  'signature.block.title': 'Bloque de sinaturas',
  'signature.block.actor': 'Asinado por {actor} o {at}',
  'signature.block.witness': 'Testemuña: {witness}',
  'recipient.line': 'Enviado a {recipient}',
  'recipient.list.heading': 'Destinatarios',
  'empty.no_photos': 'Sen fotos de aprovisionamento neste rango.',
  'empty.no_corrective_actions':
    'Sen accións correctivas rexistradas neste rango.',
  'footer.page': 'Páxina {page} de {total}',
  'footer.legal':
    'Documento xerado por nexandro · trazable por audit_log',
});
