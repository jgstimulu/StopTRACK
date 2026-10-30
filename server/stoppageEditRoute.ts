import { applyStoppageEdit } from './stoppageEdit';
import type { RecordAuthResult } from './recordAuth';
import type { SanitizedStoppage } from './stoppageSanitizer';

/**
 * Lógica de PUT /api/stoppages/:id, sem Express nem base de dados (tudo é injetado),
 * para o fluxo completo poder ser testado: autorizar -> existe? -> versão atual? ->
 * validar/aplicar -> gravar.
 */

export interface EditRouteDeps {
  authorize: (providedPin: string) => Promise<RecordAuthResult>;
  getStoppage: (id: string) => Promise<Record<string, unknown> | undefined>;
  saveStoppage: (record: SanitizedStoppage) => Promise<{ success?: boolean; error?: string } | undefined>;
  now: () => number;
}

export type EditRouteOutcome =
  | { kind: 'locked'; lockedUntil: number }
  | { kind: 'response'; status: number; body: Record<string, unknown> };

function respond(status: number, body: Record<string, unknown>): EditRouteOutcome {
  return { kind: 'response', status, body };
}

export async function handleStoppageEdit(
  id: string,
  requestBody: unknown,
  deps: EditRouteDeps
): Promise<EditRouteOutcome> {
  const body =
    typeof requestBody === 'object' && requestBody !== null
      ? (requestBody as Record<string, unknown>)
      : {};
  const providedPin = typeof body.pin === 'string' ? body.pin.trim() : '';

  const auth = await deps.authorize(providedPin);
  if (auth.status === 'locked') return { kind: 'locked', lockedUntil: auth.lockedUntil };
  if (auth.status === 'denied') {
    return respond(401, {
      error: providedPin
        ? 'PIN de operador autorizado incorreto.'
        : 'Introduza o PIN de um operador autorizado a fechar paragens.',
    });
  }

  const existing = await deps.getStoppage(id);
  if (!existing) {
    return respond(404, { error: 'Este registo já não existe (pode ter sido removido noutro posto).' });
  }

  // Se alguém editou o registo entretanto, a versão que esta pessoa viu está desatualizada:
  // não se sobrepõe a edição dos outros sem ela o saber.
  const currentVersion = typeof existing.lastEditedAt === 'number' ? existing.lastEditedAt : 0;
  const baseVersion = typeof body.baseLastEditedAt === 'number' ? body.baseLastEditedAt : 0;
  if (currentVersion !== baseVersion) {
    return respond(409, {
      error: 'Este registo foi alterado entretanto noutro posto. Feche, volte a abrir e tente novamente.',
    });
  }

  const result = applyStoppageEdit(existing, body.changes, {
    name: auth.editorName,
    at: deps.now(),
  });
  if (result.ok === false) return respond(result.status, { error: result.error });
  if (!result.changed) return respond(200, { success: true, changed: false, record: result.record });

  const saved = await deps.saveStoppage(result.record);
  if (!saved?.success) {
    return respond(409, {
      error: typeof saved?.error === 'string' ? saved.error : 'Não foi possível guardar a edição.',
    });
  }
  return respond(200, { success: true, changed: true, record: result.record });
}
