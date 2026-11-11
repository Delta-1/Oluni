import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
export function updateManifest({ bytes, versionCode, versionName, certificateSha256, commit }) {
  if (!Number.isSafeInteger(versionCode) || versionCode < 3 || !/^[a-f0-9]{64}$/i.test(certificateSha256) || !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid release metadata");
  return { packageId: "br.com.pontonorte.app", versionCode, versionName, certificateSha256: certificateSha256.toLowerCase(), sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length, url: `https://github.com/Delta-1/MoodCorp/releases/download/android-v${versionCode}/PontoNorte.apk`, commit };
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const [apk, code, certificate, commit, destination = "update.json"] = process.argv.slice(2);
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const result = updateManifest({ bytes: await readFile(apk), versionCode: Number(code), versionName: pkg.version, certificateSha256: certificate, commit });
  await writeFile(destination, `${JSON.stringify(result, null, 2)}\n`);
}
