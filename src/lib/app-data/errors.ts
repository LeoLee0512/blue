import type { CallToolResult } from "./types.ts";
import { isConnectorPending, isLoginRequired } from "./login.ts";

export type CallToolErrorKind =
  | "pending"
  | "login"
  | "not_connected"
  | "scope_denied"
  | "access_denied"
  | "error";

export type CallToolErrorState = {
  kind: CallToolErrorKind;
  message: string;
};

/** Client-visible connector error codes. Upstream sentences are not returned. */
export function publicConnectorError(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes("connector_token_pending")) return "connector_token_pending";
  if (text.includes("missing_connector_token")) return "missing_connector_token";
  if (text.includes("scope_denied")) return "scope_denied";
  if (text.includes("access_denied")) return "access_denied";
  if (text.includes("not_connected") || text.includes("failed_precondition")) return "not_connected";
  if (text.includes("login required")) return "login required";
  if (text.includes("connectorcatalogid is required")) return "connector_catalog_required";
  if (text.includes("connectortype is required")) return "connector_type_required";
  if (text.includes("cross-site")) return "cross_site_blocked";
  if (text.includes("inbound request")) return "connector_method_blocked";
  if (text.includes("circular")) return "connector_args_invalid";
  return "connector_error";
}

type MessageRule = {
  needles: readonly string[];
  kind: CallToolErrorKind;
  message: string;
};

const MESSAGE_RULES: readonly MessageRule[] = [
  {
    needles: ["not_connected", "failed_precondition"],
    kind: "not_connected",
    message: "Connect this connector in Grok to load your data.",
  },
  {
    needles: ["scope_denied"],
    kind: "scope_denied",
    message: "This view isn't available — the app requested a tool outside its grant.",
  },
  {
    needles: ["access_denied"],
    kind: "access_denied",
    message: "You don't have access to this data.",
  },
];

function matchMessageRule(raw: string): MessageRule | undefined {
  return MESSAGE_RULES.find((rule) =>
    rule.needles.some((needle) => raw.includes(needle)),
  );
}

export function classifyCallToolError(
  result: CallToolResult,
): CallToolErrorState | null {
  if (result.ok) return null;
  const raw = (result.errorMessage ?? "").toLowerCase();
  if (isConnectorPending(result)) {
    return { kind: "pending", message: "Connecting to your data…" };
  }
  if (raw.includes("missing_connector_token")) {
    return {
      kind: "error",
      message: "Open this app from Grok to load your data.",
    };
  }
  if (isLoginRequired(result)) {
    return {
      kind: "login",
      message: "Continue with Grok to load your data.",
    };
  }
  const rule = matchMessageRule(raw);
  if (rule) return { kind: rule.kind, message: rule.message };
  return {
    kind: "error",
    message: "Something went wrong. Try again.",
  };
}
