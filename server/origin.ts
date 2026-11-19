const localHosts = ["localhost", "127.0.0.1", "[::1]"];

function authority(value: string, protocol = "http:"): URL | null {
  if (!value || /[\s/@\\?#*]/.test(value)) return null;
  try {
    const parsed = new URL(`${protocol}//${value}`);
    return parsed.hostname && parsed.pathname === "/" ? parsed : null;
  } catch {
    return null;
  }
}

function hostname(value: string) {
  return value.toLowerCase().replace(/\.$/, "");
}

/** ALLOWED_HOSTS contains hostnames/IP addresses, never URLs or wildcards. */
export function allowedHosts(configuration = ""): ReadonlySet<string> {
  const hosts = new Set(localHosts.map(hostname));
  for (const item of configuration.split(",").map((value) => value.trim())) {
    if (!item) continue;
    const parsed = authority(item === "::1" ? "[::1]" : item);
    // A hostname configuration deliberately applies to the listening port.
    // Reject ports in configuration instead of silently ignoring them.
    if (!parsed || parsed.port || (item !== "::1" && /:\d+$/.test(item)))
      throw new Error("ALLOWED_HOSTS erwartet Hostnamen ohne Port oder URL.");
    hosts.add(hostname(parsed.hostname));
  }
  return hosts;
}

export function trustedHost(
  host: string | undefined,
  hosts: ReadonlySet<string>,
): boolean {
  const parsed = host ? authority(host) : null;
  return parsed !== null && hosts.has(hostname(parsed.hostname));
}

export function trustedApiRequest(
  host: string | undefined,
  origin: string | undefined,
  hosts: ReadonlySet<string>,
): boolean {
  if (!trustedHost(host, hosts)) return false;
  // CLI clients and same-origin GETs may omit Origin. Host remains mandatory.
  if (origin === undefined) return true;
  if (!/^https?:\/\/[^/?#]+$/i.test(origin) || /[\s\\]/.test(origin))
    return false;
  try {
    const parsed = new URL(origin);
    const request = authority(host!, parsed.protocol);
    return (
      !parsed.username &&
      !parsed.password &&
      request !== null &&
      hostname(parsed.hostname) === hostname(request.hostname) &&
      parsed.port === request.port
    );
  } catch {
    return false;
  }
}
