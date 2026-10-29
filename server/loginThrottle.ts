import crypto from 'crypto';
import * as supabaseStore from './supabaseStore';

/**
 * Limite de tentativas de login/PIN.
 *
 * Os contadores ficam no Supabase (partilhados por todas as instâncias e sobrevivem a reinícios).
 * Se o Supabase não responder às funções de limite — por exemplo, porque a migração
 * 20261028000000_login_throttling.sql ainda não foi executada — NÃO se bloqueia o login:
 * usam-se contadores em memória (válidos só nesta instância) e regista-se um aviso.
 */

export const THROTTLE_WINDOW_MS = 15 * 60 * 1000;
export const THROTTLE_LOCK_MS = 15 * 60 * 1000;

export interface ThrottleRule {
  key: string;
  limit: number;
}

type MemoryEntry = { failures: number; windowStartedAt: number; lockedUntil: number };

const memory = new Map<string, MemoryEntry>();
let fallbackWarningLogged = false;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memory) {
    if (entry.lockedUntil <= now && now - entry.windowStartedAt > THROTTLE_WINDOW_MS) {
      memory.delete(key);
    }
  }
}, 10 * 60 * 1000).unref();

function warnFallback(error: unknown) {
  if (fallbackWarningLogged) return;
  fallbackWarningLogged = true;
  console.warn(
    '[loginThrottle] Não foi possível usar o limite de tentativas no Supabase ' +
      '(a migração 20261028000000_login_throttling.sql foi executada?). ' +
      'A usar contadores em memória, válidos apenas nesta instância.',
    error instanceof Error ? error.message : error
  );
}

function memoryLockedUntil(keys: string[], now: number): number {
  let lockedUntil = 0;
  for (const key of keys) {
    const entry = memory.get(key);
    if (entry && entry.lockedUntil > now) lockedUntil = Math.max(lockedUntil, entry.lockedUntil);
  }
  return lockedUntil;
}

function memoryRegisterFailure(rule: ThrottleRule, now: number): number {
  const previous = memory.get(rule.key);
  // Um contador cuja janela já terminou (e sem bloqueio ativo) recomeça do zero.
  const current =
    previous && !(now - previous.windowStartedAt > THROTTLE_WINDOW_MS && previous.lockedUntil <= now)
      ? previous
      : undefined;
  const failures = (current?.failures ?? 0) + 1;
  const lockedUntil = failures >= rule.limit ? now + THROTTLE_LOCK_MS : current?.lockedUntil ?? 0;
  memory.set(rule.key, {
    failures,
    windowStartedAt: current?.windowStartedAt ?? now,
    lockedUntil,
  });
  return lockedUntil;
}

/** Instante (ms) até ao qual alguma das chaves está bloqueada; 0 se nenhuma estiver. */
export async function getLockedUntil(keys: string[]): Promise<number> {
  const now = Date.now();
  const inMemory = memoryLockedUntil(keys, now);
  try {
    const inDatabase = await supabaseStore.loginThrottleStatus(keys, now);
    return Math.max(inMemory, inDatabase);
  } catch (error) {
    warnFallback(error);
    return inMemory;
  }
}

/** Regista uma tentativa falhada em cada regra e devolve o bloqueio mais longo resultante (0 se nenhum). */
export async function registerFailure(rules: ThrottleRule[]): Promise<number> {
  const now = Date.now();
  let lockedUntil = 0;
  for (const rule of rules) {
    try {
      const result = await supabaseStore.loginThrottleFail(
        rule.key,
        now,
        rule.limit,
        THROTTLE_WINDOW_MS,
        THROTTLE_LOCK_MS
      );
      lockedUntil = Math.max(lockedUntil, result);
    } catch (error) {
      warnFallback(error);
      lockedUntil = Math.max(lockedUntil, memoryRegisterFailure(rule, now));
    }
  }
  return lockedUntil;
}

/** Apaga os contadores das chaves (depois de um login bem-sucedido). */
export async function clearFailures(keys: string[]): Promise<void> {
  for (const key of keys) memory.delete(key);
  try {
    await supabaseStore.loginThrottleClear(keys);
  } catch (error) {
    warnFallback(error);
  }
}

/** Mensagem para o utilizador e segundos para o cabeçalho Retry-After. */
export function lockedResponse(lockedUntil: number, subject = 'tentativas'): { message: string; retryAfterSeconds: number } {
  const remainingMs = Math.max(0, lockedUntil - Date.now());
  const minutes = Math.max(1, Math.ceil(remainingMs / 60000));
  return {
    message: `Demasiadas ${subject}. Tente novamente dentro de ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`,
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1000)),
  };
}

/** Identificador anónimo (hash) para não guardar emails em claro na tabela de limites. */
export function hashKeyPart(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 32);
}
