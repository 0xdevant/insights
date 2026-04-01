export async function verifyTurnstileToken(params: {
  secret: string;
  token: string;
  remoteip?: string;
}): Promise<boolean> {
  const body = new URLSearchParams();
  body.set("secret", params.secret);
  body.set("response", params.token);
  if (params.remoteip) body.set("remoteip", params.remoteip);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
    },
  );
  if (!res.ok) {
    console.warn("[turnstile] siteverify HTTP", res.status);
    return false;
  }
  const data = (await res.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };
  if (data.success === true) return true;
  const codes = data["error-codes"];
  console.warn(
    "[turnstile] siteverify failed",
    codes?.length ? codes.join(",") : "(no codes)",
  );
  return false;
}
