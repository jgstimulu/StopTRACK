import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  StoppageRecord,
  ActiveDowntime,
  Operator,
  StoppageTypeItem,
} from '../types/manutrack';

export interface FirestoreListeners {
  onStoppagesUpdate?: (stoppages: StoppageRecord[]) => void;
  onActiveDowntimesUpdate?: (activeDowntimes: ActiveDowntime[]) => void;
  onOperatorsUpdate?: (operators: Operator[]) => void;
  onStoppageTypesUpdate?: (types: StoppageTypeItem[]) => void;
  onError?: (err: any) => void;
}

/**
 * Subscribes to real-time updates across the 4 core collections
 */
export function subscribeToFirestore(listeners: FirestoreListeners): () => void {
  const unsubscribers: (() => void)[] = [];

  try {
    // 1. Stoppages collection
    const stoppagesCol = collection(db, 'stoppages');
    const unsubStoppages = onSnapshot(
      stoppagesCol,
      (snapshot) => {
        const list: StoppageRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StoppageRecord;
          if (data && data.id && !data.id.startsWith('seed-')) {
            list.push(data);
          }
        });
        list.sort(
          (a, b) => (b.startTimestamp || b.createdAt || 0) - (a.startTimestamp || a.createdAt || 0)
        );
        listeners.onStoppagesUpdate?.(list);
      },
      (err) => {
        console.warn('Firestore stoppages subscription error:', err);
        listeners.onError?.(err);
      }
    );
    unsubscribers.push(unsubStoppages);

    // 2. Active Downtimes collection
    const activeCol = collection(db, 'activeDowntimes');
    const unsubActive = onSnapshot(
      activeCol,
      (snapshot) => {
        const list: ActiveDowntime[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ActiveDowntime;
          if (data && data.machineId) {
            list.push(data);
          }
        });
        listeners.onActiveDowntimesUpdate?.(list);
      },
      (err) => {
        console.warn('Firestore active downtimes error:', err);
      }
    );
    unsubscribers.push(unsubActive);

    // 3. Operators collection
    const opsCol = collection(db, 'operators');
    const unsubOps = onSnapshot(
      opsCol,
      (snapshot) => {
        const list: Operator[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Operator;
          if (data && data.id) {
            list.push(data);
          }
        });
        if (list.length > 0) {
          listeners.onOperatorsUpdate?.(list);
        }
      },
      (err) => {
        console.warn('Firestore operators error:', err);
      }
    );
    unsubscribers.push(unsubOps);

    // 4. Stoppage Types collection
    const typesCol = collection(db, 'stoppageTypes');
    const unsubTypes = onSnapshot(
      typesCol,
      (snapshot) => {
        const list: StoppageTypeItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StoppageTypeItem;
          if (data && data.id) {
            list.push(data);
          }
        });
        if (list.length > 0) {
          listeners.onStoppageTypesUpdate?.(list);
        }
      },
      (err) => {
        console.warn('Firestore stoppage types error:', err);
      }
    );
    unsubscribers.push(unsubTypes);
  } catch (err) {
    console.warn('Error setting up Firestore subscriptions:', err);
  }

  return () => {
    unsubscribers.forEach((unsub) => {
      try {
        unsub();
      } catch {}
    });
  };
}

/**
 * Persist a stoppage record to Firestore
 */
export async function firestoreSaveStoppage(record: StoppageRecord): Promise<void> {
  try {
    const docRef = doc(db, 'stoppages', record.id);
    await setDoc(docRef, record, { merge: true });
  } catch (err) {
    console.error('Failed to save stoppage to Firestore:', err);
    throw err;
  }
}

/**
 * Delete a stoppage record from Firestore
 */
export async function firestoreDeleteStoppage(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'stoppages', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.error('Failed to delete stoppage from Firestore:', err);
    throw err;
  }
}

/**
 * Set an active running downtime in Firestore
 */
export async function firestoreSetActiveDowntime(downtime: ActiveDowntime): Promise<void> {
  try {
    const docRef = doc(db, 'activeDowntimes', downtime.machineId);
    await setDoc(docRef, downtime, { merge: true });
  } catch (err) {
    console.warn('Failed to set active downtime in Firestore:', err);
  }
}

/**
 * Remove an active running downtime from Firestore when stoppage is closed
 */
export async function firestoreRemoveActiveDowntime(machineId: string): Promise<void> {
  try {
    const docRef = doc(db, 'activeDowntimes', machineId);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Failed to remove active downtime from Firestore:', err);
  }
}

/**
 * Save an operator to Firestore
 */
export async function firestoreSaveOperator(op: Operator): Promise<void> {
  try {
    const docRef = doc(db, 'operators', op.id);
    await setDoc(docRef, op, { merge: true });
  } catch (err) {
    console.warn('Failed to save operator to Firestore:', err);
  }
}

/**
 * Delete an operator from Firestore
 */
export async function firestoreDeleteOperator(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'operators', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Failed to delete operator from Firestore:', err);
  }
}

/**
 * Save a stoppage type to Firestore
 */
export async function firestoreSaveStoppageType(typeItem: StoppageTypeItem): Promise<void> {
  try {
    const docRef = doc(db, 'stoppageTypes', typeItem.id);
    await setDoc(docRef, typeItem, { merge: true });
  } catch (err) {
    console.warn('Failed to save stoppage type to Firestore:', err);
  }
}

/**
 * Delete a stoppage type from Firestore
 */
export async function firestoreDeleteStoppageType(id: string): Promise<void> {
  try {
    const docRef = doc(db, 'stoppageTypes', id);
    await deleteDoc(docRef);
  } catch (err) {
    console.warn('Failed to delete stoppage type from Firestore:', err);
  }
}

/**
 * Seeds initial records into Firestore if Firestore is currently empty
 */
export async function firestoreSeedIfEmpty(
  localRecords: StoppageRecord[],
  localOps: Operator[],
  localTypes: StoppageTypeItem[]
): Promise<void> {
  try {
    // Check if stoppages exist
    const stoppagesCol = collection(db, 'stoppages');
    const existingStoppages = await getDocs(query(stoppagesCol, limit(1)));
    if (existingStoppages.empty && localRecords.length > 0) {
      for (const rec of localRecords) {
        if (rec && rec.id && !rec.id.startsWith('seed-')) {
          await firestoreSaveStoppage(rec).catch(() => {});
        }
      }
    }

    // Check operators
    const opsCol = collection(db, 'operators');
    const existingOps = await getDocs(query(opsCol, limit(1)));
    if (existingOps.empty && localOps.length > 0) {
      for (const op of localOps) {
        await firestoreSaveOperator(op).catch(() => {});
      }
    }

    // Check types
    const typesCol = collection(db, 'stoppageTypes');
    const existingTypes = await getDocs(query(typesCol, limit(1)));
    if (existingTypes.empty && localTypes.length > 0) {
      for (const t of localTypes) {
        await firestoreSaveStoppageType(t).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Failed checking or seeding Firestore:', err);
  }
}
