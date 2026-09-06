"use client";

import { request } from "@/lib/api/client";
import { fetchBinary, type BinaryDownload } from "./download";

/**
 * Electronic signatures — `/api/v1/signatures`.
 *
 * ## What this is, and what the screen must not call it
 *
 * The record of a **named, authenticated person adopting a specific document**,
 * where the document is identified by the SHA-256 of its exact bytes. That is
 * what section 93(2) of the Evidence Act 2011 contemplates.
 *
 * It is **not** a cryptographic digital signature — no private key, no
 * certificate authority. `SIGNATURE_KIND` says so and is rendered wherever a
 * signature is explained. Do not shorten it to fit a layout: somebody relying
 * on this record needs to know exactly what it does and does not prove.
 *
 * ## Only the named signer signs, and no permission changes that
 *
 * The API refuses everybody else including an administrator holding the whole
 * permission enum. So the screen renders the Sign button on `mine` — the API's
 * own answer to "is this yours" — and never on a `useCan`.
 */

export type ApiSignatureStatus = "PENDING" | "SIGNED" | "DECLINED" | "CANCELLED";

export type ApiSignature = {
  id: string;
  title: string;
  message: string | null;
  contentType: string;
  sizeBytes: number;
  /** Hex SHA-256 of the exact bytes. The whole point of the record. */
  documentSha256: string;
  signerId: string;
  signerName: string;
  requestedById: string;
  dueDate: string | null;
  status: ApiSignatureStatus;
  signedAt: string | null;
  signedName: string | null;
  /** The words that signer was shown, stored verbatim. Null until signed. */
  agreedWording: string | null;
  declinedAt: string | null;
  declineReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  /** The API's own answer to "is this the caller's to sign". */
  mine: boolean;
};

export const SIGNATURE_KIND =
  "This is an electronic signature: the record of a named, authenticated user " +
  "adopting the document identified by its SHA-256 fingerprint. It is not a " +
  "cryptographic digital signature — no private key or certificate authority " +
  "is involved.";

export const SIGNING_WORDING =
  "By typing my full name below and pressing Sign, I adopt this as my " +
  "signature on this document, and I agree that it has the same effect as " +
  "signing it by hand.";

export const STATUS_LABELS: Record<ApiSignatureStatus, string> = {
  PENDING: "Waiting to be signed",
  SIGNED: "Signed",
  DECLINED: "Declined",
  CANCELLED: "Taken back",
};

/** The fingerprint, split where the certificate splits it, so the two agree. */
export function fingerprintHalves(sha256: string): [string, string] {
  return [sha256.slice(0, 32), sha256.slice(32)];
}

const signalOf = (signal?: AbortSignal) => (signal ? { signal } : {});

export const signaturesApi = {
  /** Waiting on the caller. No permission — it is their own queue. */
  mine: (signal?: AbortSignal) =>
    request<ApiSignature[]>("/signatures/mine", signalOf(signal)),

  list: (status?: ApiSignatureStatus, signal?: AbortSignal) =>
    request<ApiSignature[]>("/signatures", {
      ...(status ? { query: { status } } : {}),
      ...signalOf(signal),
    }),

  get: (id: string, signal?: AbortSignal) =>
    request<ApiSignature>(`/signatures/${id}`, signalOf(signal)),

  send: (body: {
    title: string;
    message?: string | null;
    signerId: string;
    dueDate?: string | null;
    documentBase64: string;
    contentType?: string;
  }) => request<ApiSignature>("/signatures", { method: "POST", body }),

  sign: (id: string, typedName: string) =>
    request<ApiSignature>(`/signatures/${id}/sign`, {
      method: "POST",
      body: { typedName },
    }),

  decline: (id: string, reason: string) =>
    request<ApiSignature>(`/signatures/${id}/decline`, {
      method: "POST",
      body: { reason },
    }),

  cancel: (id: string) =>
    request<ApiSignature>(`/signatures/${id}/cancel`, { method: "POST" }),

  document: (id: string, stem: string): Promise<BinaryDownload> =>
    fetchBinary(`/signatures/${id}/document`, stem),

  /** Only exists once signed — the API refuses a certificate for nothing. */
  certificate: (id: string, stem: string): Promise<BinaryDownload> =>
    fetchBinary(`/signatures/${id}/certificate.pdf`, stem),
};
