import * as loginThrottle from './loginThrottle';

/**
 * Autorização para alterar um registo de paragem já gravado (apagar ou editar).
 *
 * Regras (as mesmas que o "apagar" já tinha):
 *  1. Sessão de administrador, ou sessão de operador com permissão de fechar paragens: autorizado.
 *  2. Caso contrário, o PIN de um operador ativo com permissão de fechar paragens.
 *     O PIN é testado contra todos os operadores com permissão, por isso as tentativas falhadas
 *     são limitadas por IP e globalmente (o limite global cobre quem muda de IP a cada tentativa).
 *
 * Devolve também o nome de quem autorizou, para ficar registado nas edições.
 * Sem dependências do Express nem da base de dados (tudo é injetado), para poder ser testada.
 */

export interface RecordAuthOperator {
  id: string;
  name: string;
  active: boolean;
  canClose: boolean;
  pinSalt?: string;
  pinHash?: string;
}

export interface RecordAuthSession {
  role: 'admin' | 'operator';
  operatorId?: string;
  canClose?: boolean;
}

export type RecordAuthResult =
  | { status: 'ok'; editorName: string }
  | { status: 'locked'; lockedUntil: number }
  | { status: 'denied' };

export interface RecordAuthInput {
  session: RecordAuthSession | undefined;
  providedPin: string;
  ip: string;
  getOperators: () => Promise<RecordAuthOperator[]>;
  getOperatorName: (operatorId: string) => Promise<string | undefined>;
  verifyPin: (pin: string, operator: RecordAuthOperator) => boolean;
  limits: { perIp: number; global: number };
}

export async function authorizeRecordChange(input: RecordAuthInput): Promise<RecordAuthResult> {
  const { session, providedPin, ip, limits } = input;
  const throttleKeys = [`recordpin:ip:${ip || 'unknown'}`, 'recordpin:global'];

  if (session?.role === 'admin') {
    return { status: 'ok', editorName: 'Administrador' };
  }
  if (session?.role === 'operator' && session.canClose) {
    const name = session.operatorId ? await input.getOperatorName(session.operatorId) : undefined;
    return { status: 'ok', editorName: name || 'Operador' };
  }

  // Sem sessão autorizada: só o PIN de um operador com permissão serve.
  if (providedPin) {
    const lockedUntil = await loginThrottle.getLockedUntil(throttleKeys);
    if (lockedUntil > Date.now()) return { status: 'locked', lockedUntil };
  }

  const operators = await input.getOperators();
  const matched = providedPin
    ? operators.find(
        (operator) =>
          operator.active &&
          operator.canClose &&
          operator.pinSalt &&
          operator.pinHash &&
          input.verifyPin(providedPin, operator)
      )
    : undefined;

  if (matched) {
    await loginThrottle.clearFailures([throttleKeys[0]]);
    return { status: 'ok', editorName: matched.name };
  }

  // Só conta como tentativa quando foi realmente indicado um PIN.
  if (providedPin) {
    const lockedUntil = await loginThrottle.registerFailure([
      { key: throttleKeys[0], limit: limits.perIp },
      { key: throttleKeys[1], limit: limits.global },
    ]);
    if (lockedUntil > Date.now()) return { status: 'locked', lockedUntil };
  }
  return { status: 'denied' };
}
