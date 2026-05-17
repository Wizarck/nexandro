/**
 * Català (ca-ES) template seed for M3 APPCC export.
 *
 * Per ADR-035; see `./es.ts` for the canonical key set + rationale.
 */
export const CA_TEMPLATE: Readonly<Record<string, string>> = Object.freeze({
  'bundle.title': 'Expedient APPCC · {orgName}',
  'bundle.subtitle': 'Període {from} a {to}',
  'bundle.generated_at': 'Generat el {at}',
  'bundle.generated_by': 'Generat per {actor}',
  'bundle.template_version': 'Plantilla {version}',
  'bundle.sha256': 'Signatura SHA-256: {hash}',
  'bundle.audit_log_entry': 'Entrada audit_log: {auditLogId}',
  'cover.title': "Caràtula de l'expedient",
  'cover.contract':
    "L'expedient conté l'audit_log sense editar com a capítol 0; la resta són vistes estructurades sobre el mateix registre. No produïm resum executiu.",
  'cover.signed_by': 'Signat per {actor}',
  'cover.locale_label': "Idioma de l'expedient: {locale}",
  'cover.scope_label': 'Abast: {scope}',
  'chapter.0.title': "Capítol 0 · Registre d'auditoria sense editar",
  'chapter.0.subtitle':
    "Bolcat complet de l'audit_log per al període sol·licitat.",
  'chapter.haccp.title':
    'Capítol HACCP · Lectures de PCC i accions correctives',
  'chapter.haccp.subtitle':
    'Lectures dins i fora de rang; accions correctives vinculades.',
  'chapter.lot.title': 'Capítol Traçabilitat · Cicle de vida del lot',
  'chapter.lot.subtitle': 'Recepció a consum, per lot.',
  'chapter.procurement.title':
    'Capítol Aprovisionament · Compres i recepcions',
  'chapter.procurement.subtitle':
    'Ordres de compra, recepcions, discrepàncies resoltes.',
  'chapter.photo.title':
    'Capítol Traçabilitat de fotos · Origen de lots i productes',
  'chapter.photo.subtitle':
    'Lots i productes generats mitjançant ingesta per foto.',
  'chapter.ai_obs.title': 'Capítol Empremta IA · Ús i cost',
  'chapter.ai_obs.subtitle':
    'Capacitats invocades, models, cost agregat.',
  'table.haccp.header.timestamp': 'Data i hora',
  'table.haccp.header.ccp': 'PCC',
  'table.haccp.header.reading': 'Lectura',
  'table.haccp.header.range': 'Rang acceptable',
  'table.haccp.header.in_spec': 'Dins de rang',
  'table.haccp.header.actor': 'Operari',
  'table.haccp.header.corrective_action': 'Acció correctiva',
  'table.lot.header.lot_id': 'Lot',
  'table.lot.header.supplier': 'Proveïdor',
  'table.lot.header.received_at': 'Recepció',
  'table.lot.header.consumed_at': 'Consum',
  'table.lot.header.expiry': 'Caducitat',
  'table.procurement.header.po': 'Ordre',
  'table.procurement.header.gr': 'Recepció',
  'table.procurement.header.variance': 'Discrepància',
  'table.audit_log.header.event_type': "Tipus d'esdeveniment",
  'table.audit_log.header.actor': 'Actor',
  'table.audit_log.header.aggregate': 'Agregat',
  'table.audit_log.header.created_at': 'Data',
  'signature.block.title': 'Bloc de signatures',
  'signature.block.actor': 'Signat per {actor} el {at}',
  'signature.block.witness': 'Testimoni: {witness}',
  'recipient.line': 'Enviat a {recipient}',
  'recipient.list.heading': 'Destinataris',
  'empty.no_photos': "Sense fotos d'aprovisionament en aquest rang.",
  'empty.no_corrective_actions':
    'Sense accions correctives registrades en aquest rang.',
  'footer.page': 'Pàgina {page} de {total}',
  'footer.legal':
    'Document generat per nexandro · traçable per audit_log',
});
