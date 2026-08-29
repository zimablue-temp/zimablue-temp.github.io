// Minimal GitHub OAuth provider for Decap CMS.
// Implements the two endpoints Decap's `github` backend expects when
// `backend.base_url` points here: /auth and /callback.

const GITHUB_AUTHORIZE = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN = "https://github.com/login/oauth/access_token";

function renderCallback(status, payload) {
  const content = JSON.stringify({ ...payload });
  return `<!doctype html><html><body><script>
  (function () {
    function post(message) {
      window.opener && window.opener.postMessage(message, "*");
    }
    post("authorizing:github");
    window.addEventListener("message", function () {
      post("authorization:github:${status}:${content.replace(/</g, "\\u003c")}");
    }, { once: true });
  })();
  </script></body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      return new Response("zimablue cms oauth: ok", { status: 200 });
    }

    if (url.pathname === "/auth") {
      const redirectUri = `${url.origin}/callback`;
      const to = new URL(GITHUB_AUTHORIZE);
      to.searchParams.set("client_id", env.GITHUB_OAUTH_ID);
      to.searchParams.set("redirect_uri", redirectUri);
      to.searchParams.set("scope", "repo");
      to.searchParams.set("state", crypto.randomUUID());
      return Response.redirect(to.toString(), 302);
    }

    if (url.pathname === "/callback") {
      const code = url.searchParams.get("code");
      if (!code) return new Response("missing code", { status: 400 });

      const res = await fetch(GITHUB_TOKEN, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client_id: env.GITHUB_OAUTH_ID,
          client_secret: env.GITHUB_OAUTH_SECRET,
          code,
        }),
      });
      const data = await res.json();

      if (data.error || !data.access_token) {
        return new Response(
          renderCallback("error", { message: data.error_description || "no token" }),
          { headers: { "Content-Type": "text/html" } }
        );
      }
      return new Response(
        renderCallback("success", { token: data.access_token, provider: "github" }),
        { headers: { "Content-Type": "text/html" } }
      );
    }

    return new Response("not found", { status: 404 });
  },
};
