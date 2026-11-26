# QA Handoff

## Status

Build 6 check done on 2026-11-26. Member Pro Monthly shows $2.99/month with a purchase button (labelled "Choose Member Pro"). See Result.

## Check to run

On the iPhone, reopen **Plans** in **TestFlight Build 6** and verify that **Member Pro Monthly** shows:

- **$2.99/month**
- A **Buy** button

U.S. availability and pricing are already confirmed in App Store Connect.

## Build instruction

Hold off on creating a new build.

## Result

**Checked by Claude on 2026-11-26 at about 6:43 AM, iPhone, TestFlight Build 6 (1.0.0), signed in as the sandbox test user (Free plan).**

**Member Pro Monthly: passes.** With the Monthly toggle selected, the Member Pro card shows:

- **$2.99** with "Billed every 1 month"
- A purchase button labelled **"Choose Member Pro"**. The button says "Choose Member Pro", not "Buy". It is enabled and I did not tap it.

Also seen on the same screen:

- Organizer Pro Monthly: **$5.99**, "Billed every 1 month", button "Choose Organizer Pro".
- A **Restore purchases** button.
- Footer: "Subscriptions are billed to your Apple ID and renew automatically until you cancel in your App Store settings. Prices are shown by Apple."
- No free-trial or introductory-offer wording anywhere on the screen.
- Heading "CircuSave plans" / "Choose your plan"; Free card marked "Your plan".

**Issue observed: earlier attempts failed.** Between about 6:03 and 6:23 AM the same screen showed "App Store plans could not be loaded" / "We could not load a purchasable plan" with no prices or buttons. That happened before and after the group display name was added, including after a force-close and relaunch. At 6:42 AM an already-open Plans screen still showed the error. After I went back and reopened Plans, the products loaded. I don't know what changed on the Apple side. The likely explanation is that Apple's products were not ready until the latest App Store Connect changes took effect.

**Not checked:**

- The Annual toggle was not opened. The $24.99 and $49.99 annual prices were not seen in this check.
- No purchase was started, so nothing was bought and the test user is still on Free.
- Whether the Apple sandbox tester is set up and signed in on the phone.

No new build was made. Production billing is off.

### Follow-up run: annual prices and Member Pro checkout (2026-11-26, about 6:48 AM, Build 6)

**Annual prices: pass.** With the Annual toggle selected:

- Member Pro: **$24.99**, "Billed every 1 year", "Choose Member Pro" button enabled.
- Organizer Pro: **$49.99**, "Billed every 1 year", "Choose Organizer Pro" button enabled.
- Both buttons reported enabled in the screen's accessibility data. No free-trial wording.

**Member Pro Monthly checkout: opened, not confirmed.** After switching back to Monthly ($2.99 and $5.99 shown), I tapped "Choose Member Pro". CircuSave showed "Waiting for the App Store. Finish the purchase in the App Store sheet." and Apple's in-app purchase sheet appeared (the phone's language is Spanish):

- Item: **Member Pro**, CircuSave, "Suscripción" (subscription).
- Price: **US$2.99 por mes** (US$2.99 per month).
- Apple's text: "Sólo con fines de prueba. No se te cobrará por confirmar esta compra." (For testing only. You will not be charged for confirming this purchase.) This is the Apple sandbox notice.
- No free-trial or introductory-offer line on the sheet.
- Button: "Suscribirse" (Subscribe). I did **not** tap it. The user confirms it.

**Still to record after the user confirms:** whether CircuSave moves the test account from Free to Member Pro, and any error.

### Follow-up run: checkout icon check (2026-11-26, about 7:05 AM, Build 6)

**Question:** does the purple CircuSave icon appear in Apple's checkout sheet?

**Answer: no.** I reopened Plans, selected Monthly and tapped "Choose Member Pro". Apple's "Compras en la app" (In-App Purchases) sheet opened. Where the app icon should be, it shows Apple's grey **placeholder grid icon**, not the purple CircuSave icon. This is the same placeholder as in the earlier run at about 6:48 AM.

What the sheet showed, for the record:

- Item: **Member Pro**, CircuSave (with an "UNRATED" badge), Suscripción (subscription).
- Price: **US$2.99 por mes**.
- Apple's sandbox text: "Sólo con fines de prueba. No se te cobrará por confirmar esta compra." (For testing only. You will not be charged for confirming this purchase.)
- Button: **Suscribirse** (Subscribe). I did **not** tap it. The sheet was left open at the confirmation step for the user to review.
- No free-trial or introductory-offer line.
- CircuSave behind the sheet: "Waiting for the App Store. Finish the purchase in the App Store sheet." The account was still **Free** ("Your plan" on the Free card).

**Cause not confirmed.** The placeholder is the icon Apple shows when it has no app icon for the app in App Store Connect. I did not check App Store Connect, so I can't say whether that is the reason. The build itself carries the purple icon, because the home screen and TestFlight use it. I have not verified that from this run either.

**Other things that happened during this run:**

- The iPhone dropped off USB several times. The connection came back each time.
- CircuSave locked itself after each reconnect. One unlock attempt was rejected ("That password was not accepted") because I had typed 19 characters instead of 18. Retyping fixed it.
- The earlier checkout sheet from 6:48 AM was gone when I returned. Plans showed "Purchase canceled: No subscription change was made", and the account was still Free. I did not cancel it, and I don't know whether the user did.

No new build was made. Production billing is off.

### Android lock-screen recovery check (2026-11-26, local dev backend)

**Setup.** Android emulator (Android16_Test, debug dev client) with Metro serving the current working tree. The app pointed at a local Flask backend (`http://localhost:5000` via `adb reverse`) running on a throwaway SQLite database (not the dev DB, not production, not the Railway sandbox). Test account `qa.lock@example.com` with one draft circle, "QA Secret Circle". App Lock on, Biometric Unlock off, so the lock screen goes straight to "Use account password". Before this run I stopped two stale emulator processes (with your OK) because the old emulator's Android package service was dead.

**Forgot password? visibility: pass.** Confirmed against the backend log: each wrong password produced one 401 from `/auth/mobile/login`.

| Step | Forgot password? |
| --- | --- |
| Lock screen opens | hidden |
| Wrong password 1 | hidden ("That password was not accepted.") |
| Wrong password 2 | hidden |
| Wrong password 3 | **shown** |

I ran this twice. After signing back in and locking the app again, the link was hidden again and appeared only after three new wrong passwords, so the count resets for a new lock session.

**Cancel: pass.** Tapping Forgot password? shows "Reset your password? We will email a 6-digit code to qa.lock@example.com…" with Cancel and Send code. Cancel left the lock screen up, the link still visible, and no `forgot-password` request was made. Dismissing the dialog with the Android back button did the same.

**Failed send: pass.** I stopped the local backend and chose Send code. The app showed "Could not send email" and, after OK, was still on App Locked with the link visible and the user still signed in.

**Reset and sign in: pass.** With the backend back up, Send code signed the user out and opened Recover access on the code step. I read the code from the dev backend response (`devCode`; the app does not display it). Verify code → new password → "Password reset". After that the old password returns 401 and the new one returns 200 from the API, and signing in on the emulator with the new password reached the dashboard (Circles tab lists "QA Secret Circle").

**Savings circles never exposed: not seen, with a limit.** On the lock screen, the screen text never contained the circle name. After Send code, 8 screen samples (about 1 second apart, starting about 1 second after the tap) all showed Recover access, with no circle content. I could not capture the first frames of the sign-out itself. By code, sign-out moves the lock to `signed_out`, and `shouldCoverSignedOutRoute` keeps the cover over any non-public route until the router is back on login.

**Review of the changed security guard** (`lib/__tests__/deviceLockState.test.ts`): it used to ban the word `signOut` anywhere in `components/DeviceLock.tsx`. It now bans a direct `signOut(` call and requires `runLockScreenRecovery`. This is weaker. A rewritten call such as `const out = signOut; out()` would pass it. The real protection is structural: `runLockScreenRecovery` only signs out after the person confirms and the code is emailed and staged, and `lockScreenForgotPassword.test.ts` and `lockScreenRecovery.test.ts` cover cancel, failed send, rate limit, offline and no-email, all with sign-out not called. You decide whether to keep the narrowed guard or tighten it.

**Not tested here.** iOS (no new build, per your instruction), Face ID or fingerprint unlock, a real emailed code, production.

**Cleanup.** Metro and the local backend are stopped. The emulator is still running with App Lock on for the test account.

Nothing is committed and no iOS build was made.
