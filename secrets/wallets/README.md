# Wallet signing material

The pass-signing private cert + key live in the venue's `apple_wallet`
setting (uploaded via `/admin/settings/ticketing` and stored as PEM in
the DB jsonb).

This folder is for the **Apple WWDR intermediate certificate** —
Apple's public root that signs all developer certs. It's the same file
for every developer on the planet, so it can be safely committed in
principle, but it's gitignored here to keep secrets co-located and
prevent accidental staleness if Apple rotates the root.

## Install steps

```sh
# Download the current generation (WWDR G4) from Apple's CA page:
curl -o secrets/wallets/AppleWWDRCAG4.cer \
  https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer

# Convert the DER-encoded .cer to PEM (passkit-generator wants PEM):
openssl x509 -inform DER \
  -in secrets/wallets/AppleWWDRCAG4.cer \
  -out secrets/wallets/apple-wwdr.pem

# Optionally delete the .cer:
rm secrets/wallets/AppleWWDRCAG4.cer
```

The runtime expects the PEM at `secrets/wallets/apple-wwdr.pem`. If you
ever see "WWDR intermediate certificate not found" when generating a
pass, redo the steps above.

## What's NOT in this folder

- The venue's signing cert + private key (those are stored in the DB
  under `setting.apple_wallet`, uploaded via the admin settings UI).
- The Google Wallet service-account JSON (also in the DB under
  `setting.google_wallet`).
