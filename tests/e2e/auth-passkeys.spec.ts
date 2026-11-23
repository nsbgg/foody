import { test, expect } from "@playwright/test";

test("real WebAuthn registration and passwordless login verify cryptographic assertions", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send(
    "WebAuthn.addVirtualAuthenticator",
    {
      options: {
        protocol: "ctap2",
        ctap2Version: "ctap2_1",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    },
  );
  // A same-origin document without application bootstrapping avoids competing
  // anonymous-session responses while this test drives the API directly.
  await page.goto("/api/health");
  let session = await (await context.request.get("/api/session")).json();
  async function post(path: string, data: unknown) {
    return context.request.post(path, {
      data,
      headers: { "X-CSRF-Token": session.csrfToken },
    });
  }
  const email = `passkey-${crypto.randomUUID()}@example.com`;
  const registered = await post("/api/auth/register", {
    name: "Passkey Test",
    email,
    password: "strong-test-password-123",
  });
  expect(registered.status(), await registered.text()).toBe(201);
  session = await registered.json();
  const options = await (
    await post("/api/auth/passkeys/registration/options", {})
  ).json();
  const response = await page.evaluate(async (optionsJSON) => {
    const credential = (await navigator.credentials.create({
      publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(optionsJSON),
    })) as PublicKeyCredential;
    return credential.toJSON();
  }, options);
  expect(
    (
      await post("/api/auth/passkeys/registration/verify", {
        response,
        name: "Virtual authenticator",
      })
    ).status(),
  ).toBe(201);
  expect(
    (
      await post("/api/auth/passkeys/registration/verify", { response })
    ).status(),
  ).toBe(400);
  const listed = await (await context.request.get("/api/auth/passkeys")).json();
  expect(listed.passkeys).toHaveLength(1);
  session = await (await post("/api/auth/logout", {})).json();
  const authenticationOptions = await (
    await post("/api/auth/passkeys/authentication/options", {})
  ).json();
  const assertion = await page.evaluate(async (optionsJSON) => {
    const credential = (await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON),
    })) as PublicKeyCredential;
    return credential.toJSON();
  }, authenticationOptions);
  const loggedIn = await post("/api/auth/passkeys/authentication/verify", {
    response: assertion,
  });
  expect(loggedIn.status()).toBe(200);
  session = await loggedIn.json();
  expect(session.user.email).toBe(email);
  expect(
    (
      await post("/api/auth/passkeys/authentication/verify", {
        response: assertion,
      })
    ).status(),
  ).toBe(400);
  // Correct challenge but tampered userHandle must not authenticate another account.
  const nextOptions = await (
    await post("/api/auth/passkeys/authentication/options", {})
  ).json();
  const wrongHandle = await page.evaluate(async (optionsJSON) => {
    const credential = (await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON),
    })) as PublicKeyCredential;
    const value = credential.toJSON() as AuthenticationResponseJSON;
    value.response.userHandle = "wrong-handle";
    return value;
  }, nextOptions);
  expect(
    (
      await post("/api/auth/passkeys/authentication/verify", {
        response: wrongHandle,
      })
    ).status(),
  ).toBe(400);
  const confirmOptions = await (
    await post("/api/auth/passkeys/authentication/options", {
      reauthenticate: true,
    })
  ).json();
  expect(
    confirmOptions.allowCredentials.map(
      (credential: { id: string }) => credential.id,
    ),
  ).toContain(listed.passkeys[0].id);
  const confirmAssertion = await page.evaluate(async (optionsJSON) => {
    const credential = (await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON),
    })) as PublicKeyCredential;
    return credential.toJSON();
  }, confirmOptions);
  const confirmed = await post("/api/auth/passkeys/authentication/verify", {
    response: confirmAssertion,
    reauthenticate: true,
  });
  expect(confirmed.status()).toBe(200);
  session = await confirmed.json();
  expect(session.user.email).toBe(email);
  const other = await post("/api/auth/register", {
    name: "Other",
    email: `other-${crypto.randomUUID()}@example.com`,
    password: "other-strong-password-123",
  });
  session = await other.json();
  const otherId = session.user.id;
  const otherOptions = await (
    await post("/api/auth/passkeys/authentication/options", {
      reauthenticate: true,
    })
  ).json();
  const otherAssertion = await page.evaluate(async (optionsJSON) => {
    const credential = (await navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(optionsJSON),
    })) as PublicKeyCredential;
    return credential.toJSON();
  }, otherOptions);
  expect(
    (
      await post("/api/auth/passkeys/authentication/verify", {
        response: otherAssertion,
        reauthenticate: true,
      })
    ).status(),
  ).toBe(400);
  expect(
    (await (await context.request.get("/api/session")).json()).user.id,
  ).toBe(otherId);
  await cdp.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
});

type AuthenticationResponseJSON = { response: { userHandle?: string } };
