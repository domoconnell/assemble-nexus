import forge from "node-forge";

/**
 * Convert a PKCS#12 (.p12) bundle into separate PEM-format certificate
 * and private key strings.
 *
 * `passkit-generator` wants the cert and key as PEM at signing time; we
 * extract once at the moment the admin uploads the file in settings and
 * persist the resulting PEMs to the venue's settings row so we don't need
 * to re-decrypt for every pass we issue.
 */
export function p12ToPem(p12Base64, passphrase = "") {
	if (!p12Base64) throw new Error("Missing PKCS#12 payload");
	const p12Buffer = Buffer.from(p12Base64, "base64");
	const p12Der = p12Buffer.toString("binary");
	const p12Asn1 = forge.asn1.fromDer(p12Der);
	let p12;
	try {
		p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, passphrase);
	} catch (err) {
		throw new Error(
			err?.message?.includes("Invalid password")
				? "Wrong passphrase for that .p12 file."
				: `Could not read .p12 file: ${err?.message ?? "unknown error"}`,
		);
	}

	let certPem = null;
	let keyPem = null;
	for (const safeContents of p12.safeContents) {
		for (const safeBag of safeContents.safeBags) {
			if (safeBag.cert && !certPem) {
				certPem = forge.pki.certificateToPem(safeBag.cert);
			}
			if (safeBag.key && !keyPem) {
				keyPem = forge.pki.privateKeyToPem(safeBag.key);
			}
		}
	}
	if (!certPem || !keyPem) {
		throw new Error(
			"Couldn't find both a certificate and a private key in that .p12 bundle.",
		);
	}
	return { certPem, keyPem };
}
