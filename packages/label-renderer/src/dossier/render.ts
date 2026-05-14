import type { RecallDossierData, RecallDossierTraceNode } from './types';

/**
 * Render a recall dossier to a PDF Buffer.
 *
 * Per ADR-028 (architecture-m3.md) the recall dossier reuses the
 * `packages/label-renderer/` pattern WITHOUT a new package. Per
 * ADR-DOSSIER-PDF-RENDERER-LOCAL (slice #13 design.md) the renderer
 * uses the same dynamic-import discipline as `src/render.ts` so
 * apps/api Jest tests don't transitively pull `@react-pdf/renderer`
 * (an ESM-only dependency tree) at import time.
 *
 * The dossier React component is composed inline because the dossier
 * shape (chronology + lot provenance + consumption chain + signature
 * block) shares no public surface with the EU 1169/2011 label.
 */
export async function renderRecallDossierToPdf(
  data: RecallDossierData,
): Promise<Buffer> {
  const [reactNs, rendererNs] = await Promise.all([
    import('react'),
    import('@react-pdf/renderer'),
  ]);
  const React = (reactNs as unknown as { default?: typeof reactNs }).default
    ?? reactNs;
  const renderer = (rendererNs as unknown as { default?: typeof rendererNs })
    .default ?? rendererNs;

  const { Document, Page, Text, View, StyleSheet } = renderer;

  const styles = StyleSheet.create({
    page: { padding: 36, fontSize: 10, fontFamily: 'Helvetica' },
    title: { fontSize: 18, marginBottom: 6, fontWeight: 700 },
    eyebrow: { fontSize: 9, marginBottom: 16, color: '#666' },
    section: { marginTop: 14, marginBottom: 6 },
    sectionTitle: { fontSize: 13, fontWeight: 700, marginBottom: 4 },
    row: { marginBottom: 2 },
    mute: { color: '#888' },
    signature: {
      marginTop: 20,
      paddingTop: 8,
      borderTop: '1pt solid #999',
      fontSize: 9,
    },
    chainBroken: {
      marginTop: 10,
      padding: 6,
      backgroundColor: '#fff3e0',
      border: '1pt solid #d97706',
      fontSize: 9,
    },
  });

  function renderTraceNode(
    node: RecallDossierTraceNode | null,
    depth: number,
  ): unknown {
    if (!node) {
      return React.createElement(
        Text,
        { style: styles.mute },
        '(sin datos de trazabilidad)',
      );
    }
    const indent = '  '.repeat(depth);
    const qty =
      node.quantityConsumed !== undefined && node.quantityConsumed !== null
        ? ` · ${node.quantityConsumed}`
        : '';
    const sw = node.serviceWindow ? ` · ${node.serviceWindow}` : '';
    const depthMark = node.depthExceeded ? ' …profundidad excedida' : '';
    return React.createElement(View, { key: `${node.aggregateId}-${depth}` }, [
      React.createElement(
        Text,
        { style: styles.row, key: `t-${node.aggregateId}-${depth}` },
        `${indent}${node.aggregateType}: ${node.label}${qty}${sw}${depthMark}`,
      ),
      ...node.children.map((child, idx) =>
        React.createElement(
          View,
          { key: `c-${child.aggregateId}-${depth}-${idx}` },
          renderTraceNode(child, depth + 1) as never,
        ),
      ),
    ]);
  }

  const doc = React.createElement(
    Document,
    null,
    React.createElement(Page, { size: 'A4', style: styles.page }, [
      React.createElement(
        Text,
        { style: styles.title, key: 'title' },
        `Dossier de incidente · ${data.incidentCode}`,
      ),
      React.createElement(
        Text,
        { style: styles.eyebrow, key: 'eyebrow' },
        `Abierto: ${data.openedAt} · Plazo legal: ${data.legalDeadline}`,
      ),
      data.signatureBlock.chainBroken
        ? React.createElement(
            View,
            { style: styles.chainBroken, key: 'chain-broken' },
            React.createElement(
              Text,
              null,
              `Aviso: la cadena audit_log presenta una discontinuidad en la fila ${data.signatureBlock.firstBrokenRowId ?? '(desconocida)'}. El dossier se ha generado de todos modos por mandato de plazo legal (EU 178/2002 ≤4h).`,
            ),
          )
        : null,
      React.createElement(View, { style: styles.section, key: 's-chron' }, [
        React.createElement(
          Text,
          { style: styles.sectionTitle, key: 's-chron-title' },
          'Cronología del incidente',
        ),
        ...data.chronology.map((entry, idx) =>
          React.createElement(
            Text,
            { style: styles.row, key: `chron-${idx}` },
            `· ${entry.createdAt} · ${entry.eventType} · actor=${entry.actorKind}`,
          ),
        ),
      ]),
      React.createElement(View, { style: styles.section, key: 's-prov' }, [
        React.createElement(
          Text,
          { style: styles.sectionTitle, key: 's-prov-title' },
          'Procedencia del lote',
        ),
        renderTraceNode(data.lotProvenance, 0) as never,
      ]),
      React.createElement(View, { style: styles.section, key: 's-cons' }, [
        React.createElement(
          Text,
          { style: styles.sectionTitle, key: 's-cons-title' },
          'Cadena de consumo',
        ),
        renderTraceNode(data.consumptionChain, 0) as never,
      ]),
      React.createElement(View, { style: styles.signature, key: 's-sig' }, [
        React.createElement(
          Text,
          { style: styles.row, key: 'sig-actor' },
          `Actor: ${data.signatureBlock.actorUserName ?? '(sistema)'} · Generado: ${data.signatureBlock.generatedAt}`,
        ),
        React.createElement(
          Text,
          { style: styles.row, key: 'sig-hash' },
          `Dossier SHA-256: ${data.signatureBlock.dossierHash}`,
        ),
        React.createElement(
          Text,
          { style: styles.row, key: 'sig-chain' },
          `Cadena audit_log: ${data.signatureBlock.chainBroken ? 'rota' : 'íntegra'}`,
        ),
      ]),
    ]),
  );

  return renderer.renderToBuffer(doc as never);
}
