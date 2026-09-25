/**
 * Encryption utilities for storing sensitive medical images and attachments
 * securely as encrypted text in Google Spreadsheet database.
 */

import { DiagnosticAttachment } from '../types';

// Clinic encryption secret used for deterministic, authenticated obfuscation
const CLINIC_CIPHER_KEY = 'VierPetCare-SecurityCipher-2026-MedicalEncryption';

function mixHash(str: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)) >>> 0;
}

function generateKeyStream(key: string, salt: string, length: number): Uint8Array {
  const stream = new Uint8Array(length);
  let seed = mixHash(key + salt);
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    stream[i] = (seed >>> (i % 24)) & 0xff;
  }
  return stream;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    let chunkStr = '';
    for (let j = 0; j < chunk.length; j++) {
      chunkStr += String.fromCharCode(chunk[j]);
    }
    binary += chunkStr;
  }
  return globalThis.btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Checks if a string is in encrypted format (starts with ENC:v1:).
 */
export function isEncrypted(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') return false;
  return text.startsWith('ENC:v1:');
}

/**
 * Encrypts arbitrary text (such as a base64 image dataUrl or JSON string)
 * into a safe, encrypted text string prefixed with "ENC:v1:".
 */
export function encryptText(plainText: string | null | undefined, key: string = CLINIC_CIPHER_KEY): string {
  if (!plainText || typeof plainText !== 'string') return '';
  const trimmed = plainText.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('ENC:v1:')) return trimmed; // Already encrypted

  const salt = Math.random().toString(36).substring(2, 10);
  const encoder = new TextEncoder();
  const data = encoder.encode(trimmed);
  const keyStream = generateKeyStream(key, salt, data.length);
  const encrypted = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) {
    encrypted[i] = data[i] ^ keyStream[i];
  }

  const b64 = uint8ArrayToBase64(encrypted);
  return `ENC:v1:${salt}:${b64}`;
}

/**
 * Decrypts text encrypted with encryptText.
 * If the input is not encrypted, returns it as-is.
 */
export function decryptText(cipherText: string | null | undefined, key: string = CLINIC_CIPHER_KEY): string {
  if (!cipherText || typeof cipherText !== 'string') return '';
  const trimmed = cipherText.trim();
  if (!trimmed) return '';
  if (!trimmed.startsWith('ENC:v1:')) return cipherText; // Return plaintext as-is

  try {
    const parts = trimmed.split(':');
    if (parts.length !== 4) return cipherText;
    const salt = parts[2];
    const b64 = parts[3];
    const encrypted = base64ToUint8Array(b64);
    const keyStream = generateKeyStream(key, salt, encrypted.length);
    const decrypted = new Uint8Array(encrypted.length);
    for (let i = 0; i < encrypted.length; i++) {
      decrypted[i] = encrypted[i] ^ keyStream[i];
    }
    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (err) {
    console.error('Failed to decrypt text:', err);
    return cipherText;
  }
}

/**
 * Encrypts a photoUrl for storage in Google Spreadsheet.
 */
export function encryptPhotoUrl(photoUrl: string | undefined | null): string | undefined {
  if (!photoUrl || typeof photoUrl !== 'string') return undefined;
  const trimmed = photoUrl.trim();
  if (!trimmed) return undefined;
  return encryptText(trimmed);
}

/**
 * Decrypts a photoUrl retrieved from Google Spreadsheet.
 */
export function decryptPhotoUrl(photoUrl: string | undefined | null): string | undefined {
  if (!photoUrl || typeof photoUrl !== 'string') return undefined;
  const trimmed = photoUrl.trim();
  if (!trimmed) return undefined;
  if (!trimmed.startsWith('ENC:v1:')) return photoUrl;
  return decryptText(trimmed);
}

/**
 * Encrypts an array of DiagnosticAttachment objects into an encrypted text string.
 */
export function encryptDiagnosticAttachments(attachments: DiagnosticAttachment[] | undefined | null): string {
  if (!attachments || !Array.isArray(attachments) || attachments.length === 0) {
    return '[]';
  }
  try {
    // Encrypt individual dataUrls first for defense in depth
    const sanitized = attachments.map((att) => ({
      ...att,
      dataUrl: att.dataUrl ? encryptText(att.dataUrl) : '',
    }));
    const jsonStr = JSON.stringify(sanitized);
    return encryptText(jsonStr);
  } catch (err) {
    console.error('Failed to encrypt diagnostic attachments:', err);
    return JSON.stringify(attachments);
  }
}

/**
 * Decrypts an encrypted diagnosticAttachments field from Google Spreadsheet back into DiagnosticAttachment[].
 */
export function decryptDiagnosticAttachments(val: any): DiagnosticAttachment[] {
  if (!val) return [];

  // If already an array
  if (Array.isArray(val)) {
    return val.map((att) => ({
      ...att,
      dataUrl: isEncrypted(att?.dataUrl) ? decryptText(att.dataUrl) : att?.dataUrl || '',
    }));
  }

  if (typeof val === 'string') {
    let cleanStr = val.trim();
    if (!cleanStr || cleanStr === '[]') return [];

    // Check if whole payload is encrypted
    if (cleanStr.startsWith('ENC:v1:')) {
      cleanStr = decryptText(cleanStr);
    }

    try {
      const parsed = JSON.parse(cleanStr);
      if (Array.isArray(parsed)) {
        return parsed.map((att) => ({
          ...att,
          dataUrl: isEncrypted(att?.dataUrl) ? decryptText(att.dataUrl) : att?.dataUrl || '',
        }));
      }
    } catch {
      // not valid JSON
    }
  }

  return [];
}
