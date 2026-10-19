import {
  type AuthenticationCreds,
  type AuthenticationState,
  BufferJSON,
  initAuthCreds,
  proto,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from 'baileys';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export async function usePostgresAuthState(tenantId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clearSession: () => Promise<void>;
}> {
  const writeData = async (key: string, data: unknown) => {
    try {
      const value = JSON.stringify(data, BufferJSON.replacer);
      await prisma.whatsAppSessionKey.upsert({
        where: { tenantId_key: { tenantId, key } },
        update: { value },
        create: { tenantId, key, value },
      });
    } catch (err) {
      logger.error({ err, tenantId, key }, 'Erro ao salvar chave WhatsApp no Postgres');
    }
  };

  const readData = async (key: string) => {
    try {
      const record = await prisma.whatsAppSessionKey.findUnique({
        where: { tenantId_key: { tenantId, key } },
      });
      if (!record) return null;
      return JSON.parse(record.value, BufferJSON.reviver);
    } catch (err) {
      logger.error({ err, tenantId, key }, 'Erro ao ler chave WhatsApp do Postgres');
      return null;
    }
  };

  const removeData = async (key: string) => {
    try {
      await prisma.whatsAppSessionKey.deleteMany({
        where: { tenantId, key },
      });
    } catch (err) {
      logger.error({ err, tenantId, key }, 'Erro ao deletar chave WhatsApp do Postgres');
    }
  };

  const credsData = await readData('creds');
  const creds: AuthenticationCreds = credsData || initAuthCreds();

  const keys: SignalKeyStore = {
    get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
      const data: { [key: string]: SignalDataTypeMap[T] } = {};
      await Promise.all(
        ids.map(async (id) => {
          let value = await readData(`${type}-${id}`);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          if (value) {
            data[id] = value as SignalDataTypeMap[T];
          }
        }),
      );
      return data;
    },
    set: async (data: SignalDataSet) => {
      const tasks: Promise<void>[] = [];
      for (const category in data) {
        const cat = category as keyof SignalDataSet;
        const subMap = data[cat];
        if (subMap) {
          for (const id in subMap) {
            const value = subMap[id];
            const key = `${category}-${id}`;
            tasks.push(value ? writeData(key, value) : removeData(key));
          }
        }
      }
      await Promise.all(tasks);
    },
  };

  return {
    state: {
      creds,
      keys,
    },
    saveCreds: async () => {
      await writeData('creds', creds);
    },
    clearSession: async () => {
      await prisma.whatsAppSessionKey.deleteMany({
        where: { tenantId },
      });
    },
  };
}
