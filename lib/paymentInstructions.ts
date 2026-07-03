// lib/paymentInstructions.ts
// Local fallback store for per-circle payment instructions.
// Used when the backend doesn't yet return paymentInstructions on the circle.
import { getItemAsync, setItemAsync, deleteItemAsync } from 'expo-secure-store';

const key = (circleId: string) => `payment_instructions_${circleId}`;

export async function getLocalPaymentInstructions(
  circleId: string,
): Promise<string | null> {
  try {
    return await getItemAsync(key(circleId));
  } catch {
    return null;
  }
}

export async function setLocalPaymentInstructions(
  circleId: string,
  instructions: string,
): Promise<void> {
  try {
    await setItemAsync(key(circleId), instructions);
  } catch {}
}

export async function clearLocalPaymentInstructions(
  circleId: string,
): Promise<void> {
  try {
    await deleteItemAsync(key(circleId));
  } catch {}
}
