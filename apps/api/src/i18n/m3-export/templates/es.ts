/**
 * Castellano (es-ES) template seed for M3 APPCC export.
 *
 * Per ADR-035 the templates are ICU MessageFormat strings; placeholders
 * use `{var}` syntax and are interpolated by `TranslatorService`. This
 * file ships as a TypeScript constant module (rather than a JSON asset)
 * so the templates are type-checked at build time and require no
 * additional nest-cli `assets` configuration.
 */
export const ES_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  'bundle.title': 'Expediente APPCC · {orgName}',
  'bundle.subtitle': 'Periodo {from} a {to}',
  'bundle.generated_at': 'Generado el {at}',
  'bundle.generated_by': 'Generado por {actor}',
  'bundle.template_version': 'Plantilla {version}',
  'bundle.sha256': 'Firma SHA-256: {hash}',
  'bundle.audit_log_entry': 'Entrada audit_log: {auditLogId}',
  'cover.title': 'Carátula del expediente',
  'cover.contract':
    'El expediente contiene el audit_log sin editar como capítulo 0; el resto son vistas estructuradas sobre ese mismo registro. No producimos resumen ejecutivo.',
  'cover.signed_by': 'Firmado por {actor}',
  'cover.locale_label': 'Idioma del expediente: {locale}',
  'cover.scope_label': 'Alcance: {scope}',
  'chapter.0.title': 'Capítulo 0 · Registro de auditoría sin editar',
  'chapter.0.subtitle':
    'Volcado completo de audit_log para el periodo solicitado.',
  'chapter.haccp.title':
    'Capítulo HACCP · Lecturas de PCC y acciones correctivas',
  'chapter.haccp.subtitle':
    'Lecturas dentro y fuera de rango; acciones correctivas vinculadas.',
  'chapter.lot.title': 'Capítulo Trazabilidad · Ciclo de vida del lote',
  'chapter.lot.subtitle': 'Recepción a consumo, por lote.',
  'chapter.procurement.title':
    'Capítulo Aprovisionamiento · Compras y recepciones',
  'chapter.procurement.subtitle':
    'Órdenes de compra, recepciones, discrepancias resueltas.',
  'chapter.photo.title':
    'Capítulo Trazabilidad de fotos · Origen de lotes y productos',
  'chapter.photo.subtitle':
    'Lotes y productos generados mediante ingesta por foto.',
  'chapter.ai_obs.title': 'Capítulo Huella IA · Uso y coste',
  'chapter.ai_obs.subtitle':
    'Capacidades invocadas, modelos, coste agregado.',
  'table.haccp.header.timestamp': 'Fecha y hora',
  'table.haccp.header.ccp': 'PCC',
  'table.haccp.header.reading': 'Lectura',
  'table.haccp.header.range': 'Rango aceptable',
  'table.haccp.header.in_spec': 'En rango',
  'table.haccp.header.actor': 'Operario',
  'table.haccp.header.corrective_action': 'Acción correctiva',
  'table.lot.header.lot_id': 'Lote',
  'table.lot.header.supplier': 'Proveedor',
  'table.lot.header.received_at': 'Recepción',
  'table.lot.header.consumed_at': 'Consumo',
  'table.lot.header.expiry': 'Caducidad',
  'table.procurement.header.po': 'Orden',
  'table.procurement.header.gr': 'Recepción',
  'table.procurement.header.variance': 'Discrepancia',
  'table.audit_log.header.event_type': 'Tipo de evento',
  'table.audit_log.header.actor': 'Actor',
  'table.audit_log.header.aggregate': 'Agregado',
  'table.audit_log.header.created_at': 'Fecha',
  'signature.block.title': 'Bloque de firmas',
  'signature.block.actor': 'Firmado por {actor} el {at}',
  'signature.block.witness': 'Testigo: {witness}',
  'recipient.line': 'Enviado a {recipient}',
  'recipient.list.heading': 'Destinatarios',
  'empty.no_photos': 'Sin fotos de aprovisionamiento en este rango.',
  'empty.no_corrective_actions':
    'Sin acciones correctivas registradas en este rango.',
  'footer.page': 'Página {page} de {total}',
  'footer.legal':
    'Documento generado por nexandro · trazable por audit_log',
});
