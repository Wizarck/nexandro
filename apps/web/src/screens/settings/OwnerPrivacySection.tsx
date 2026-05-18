import { Link } from 'react-router-dom';

/**
 * Privacidad y datos — GDPR landing per audit 2026-05-18 L3-1.
 *
 * Today: surfaces the policies + commitments + entry points. Most actions
 * are placeholders. Honest framing ("estos controles llegarán con la
 * próxima iteración") avoids the "appears empty / hostile" UX the bare
 * settings page produced.
 *
 * Coming in next slices:
 *   - "Exportar mis datos" (RGPD art. 20 portability) → ZIP with org's
 *     audit_log + ingredients + recipes + photos manifest
 *   - "Eliminar mi organización" (RGPD art. 17 erasure) → 14-day grace +
 *     audit_log archival
 *   - Configurable retention period per data class
 *   - DPO contact form
 *   - Cookie consent log (B2B SaaS context: light)
 */
export function OwnerPrivacySection() {
  return (
    <section className="space-y-6" aria-label="Privacidad y datos">
      <header>
        <h2 className="text-xl font-semibold text-ink">Privacidad y datos</h2>
        <p className="mt-1 text-sm text-mute">
          Lo que nexandro guarda, durante cuánto tiempo, y cómo puedes ejercer tus derechos RGPD.
        </p>
      </header>

      <div className="space-y-3">
        <SummaryCard
          title="¿Qué guarda nexandro?"
          body={
            <>
              <p>
                Datos operativos de tu cocina: ingredientes, recetas, lotes, fotos de receiving,
                lecturas HACCP, eventos de auditoría. Identidad de usuarios (email + rol + acciones).
                Ningún dato de cliente final ni datos sensibles de empleados más allá de la firma
                en lecturas HACCP.
              </p>
              <p className="mt-2 text-xs text-mute">
                Detalle completo en{' '}
                <Link
                  to="/audit-log"
                  className="underline hover:text-ink"
                >
                  Auditoría
                </Link>
                : cada evento muestra qué datos fueron escritos.
              </p>
            </>
          }
        />

        <SummaryCard
          title="Retención"
          body={
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>audit_log</strong> · 7 años (cumple con plazos UE 178/2002 y normativa
                fiscal). Archivado a almacenamiento frío tras 1 año.
              </li>
              <li>
                <strong>Fotos de ingestión</strong> · 90 días en almacenamiento caliente, después
                eliminación física tras 7 días de grace.
              </li>
              <li>
                <strong>Recetas, ingredientes, proveedores</strong> · sin caducidad mientras
                la organización esté activa.
              </li>
            </ul>
          }
        />

        <SummaryCard
          title="Tus derechos RGPD"
          body={
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Acceso + portabilidad (arts. 15 + 20)</strong> · solicita un export
                completo de los datos de tu organización en formato máquina-legible (JSON + CSV +
                PDFs). <em className="text-mute">Próximamente.</em>
              </li>
              <li>
                <strong>Eliminación (art. 17)</strong> · elimina permanentemente la organización y
                todos sus datos derivados. Plazo de 14 días para arrepentirte, luego borrado
                físico irreversible. <em className="text-mute">Próximamente.</em>
              </li>
              <li>
                <strong>Rectificación (art. 16)</strong> · todos los registros operativos son
                editables; los registros de auditoría sólo son corregibles vía addendum
                (preserva la trazabilidad).
              </li>
              <li>
                <strong>Oposición / limitación (arts. 18 + 21)</strong> · contacta con tu DPO
                interno. nexandro no realiza profiling automatizado sobre tus clientes finales.
              </li>
            </ul>
          }
        />

        <SummaryCard
          title="Datos del DPO"
          body={
            <p className="text-sm text-mute italic">
              Si tu organización tiene Data Protection Officer designado, podrás capturar su
              contacto aquí (email + teléfono) para incluirlo en exportes oficiales y notificaciones
              a la AEPD. <em>Próximamente.</em>
            </p>
          }
        />

        <SummaryCard
          title="Seguridad de la cuenta"
          body={
            <ul className="list-disc space-y-1 pl-5 text-sm">
              <li>Autenticación de 2 factores (2FA / TOTP) — <em className="text-mute">próximamente con R8 auth</em></li>
              <li>Rotación de tokens API — <em className="text-mute">próximamente</em></li>
              <li>Sesiones activas con cierre remoto — <em className="text-mute">próximamente</em></li>
            </ul>
          }
        />
      </div>
    </section>
  );
}

function SummaryCard({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-border-subtle p-5">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      <div className="mt-2 text-sm text-ink">{body}</div>
    </article>
  );
}
