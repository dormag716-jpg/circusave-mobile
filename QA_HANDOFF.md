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

### Regression test: App Locked -> Send code -> sign-out -> Recover access (2026-11-26)

New test file: `lib/__tests__/lockScreenRecoveryTransition.test.ts` (10 tests). It runs the real lock reducer, the signed-out route cover rule, the staged recovery step and `runLockScreenRecovery` in the order the app uses them. No device was used.

**Result: pass.** `npx tsc --noEmit` is clean and `npm test -- --runInBand` passes (166 suites, 1511 tests).

What it checks:

- **Private screens stay covered through the transition.** The cover is on while locked, after the code is requested, after the recovery step is saved, and after sign-out while the private route is still mounted. It drops only once the router is on the login route (Recover access). Every private route (dashboard, circles, activity, settings, a circle, circle history, security) is covered while signed out; only login is open.
- **Sign-out happens only after the recovery step is saved.** The call order is request, stage, signOut. The test also asserts the step is already saved at the moment sign-out starts, and that sign-out does not run if saving the step throws.
- **Cancel leaves the app locked.** No request, no staged step, no sign-out. The lock stays up and covered.
- **A failed send leaves the app locked.** Not accepted, server error, offline and rate limit each give no staged step and no sign-out, with the lock still covering.
- **Recover access opens on the code step** for the same email, with no second email request.

**Does it catch a regression?** I temporarily moved sign-out ahead of the request in `lib/auth/lockScreenRecovery.ts`. 7 of the 10 tests failed. I then restored the file with `git checkout`, and the full suite is green again.

**Limits.**
- The cover rule is copied into the test, because `DeviceLock.tsx` has no renderer in this test setup. A source check fails if `DeviceLock.tsx` stops using that same rule (`coverVisible = coverLocked || coverSignedOut`, and the signed-out check with `shouldCoverSignedOutRoute(pathname)`) or calls `signOut(` directly. A change to how the component renders the cover would not be caught.
- It does not drive real navigation timing. The Android run on 2026-11-26 is the only on-device evidence, and it could not capture the first frames of the sign-out.

Not committed and no iOS build, as requested.

### Member Pro Monthly sandbox purchase: Free -> Member Pro check (2026-11-26, about 10:00 AM, Build 6)

**Status: not verified. The sandbox backend still shows Free.** You said you confirmed the purchase in Apple's sandbox sheet.

**Sandbox backend (Railway, signed in as `sandbox.tester@example.com`): Free.**

- `GET /api/auth/me/entitlements` returned `plan: free`, `tier: free`, `source: none`, `subscriptionStatus: inactive`, `currentPeriodEnd: null`, `cancelAtPeriodEnd: false`. Capabilities are the Free ones (1 open circle, no premium reminders, no multi-circle).
- `GET /api/billing/apple/status` returned `enabled: true`, `environment: sandbox`, all four product IDs, and an `appAccountToken`. So Apple billing is on and reachable, and the account has no subscription recorded.

**App (iPhone): not checked.** The Appium/WebDriverAgent helper could not start. The session request failed with "RemoteXPC is not available for this session". I asked for the Windows UAC prompt that restarts the elevated tunnel, and no tunnel process appeared afterwards, so the prompt was probably not accepted. I did not read the Plans screen, so I can't say what the app showed after the purchase.

**What this does and does not show.**

- It shows the backend had not recorded a Member Pro subscription for this account at about 10:00 AM.
- It does not show why. I can't tell yet whether the purchase did not complete on the phone, the app did not send the Apple transaction to the backend, the backend rejected it, or the phone is signed in as a different account from `sandbox.tester@example.com`.
- I could not see request logs: Railway's logs show only the gunicorn boot lines, and I did not query the sandbox database.

**Next checks.**

1. Read the Plans screen on the iPhone. This needs the UAC prompt accepted, or you can tell me what Plans and Settings show.
2. If the app shows Free too, tap Restore purchases and see whether the backend changes.
3. If it still shows Free, look at the sandbox database for Apple transactions and at the verify call's response. That is a one-off Railway command and needs your OK.

No code, build, commit or production change was made.

### Follow-up: app and backend after the Member Pro Monthly purchase (2026-11-26, about 10:08 AM, Build 6)

**Result: failed to verify. Both the app and the sandbox backend still show Free.**

The helper that reads the iPhone came back after two UAC prompts (a stale tunnel from an earlier session was holding its port, so I stopped it and restarted). I unlocked the app with the sandbox test user's account password after cancelling the Face ID sheet.

**App (iPhone, Build 6):**

- Signed in as Sandbox Tester, `sandbox.tester@example.com`.
- Settings shows "Subscription. Free plan".
- Plans shows the Free card marked "Your plan" and no change on Member Pro or Organizer Pro. The Annual toggle was selected, so Member Pro showed $24.99 and Organizer Pro $49.99. The dashboard still says "Free: 1 open circle at a time".
- I tapped **Restore purchases**. The screen showed no message that I could read and the plan stayed Free. I waited about 15 seconds and read the screen again: still Free.

**Sandbox backend (Railway):** `GET /api/auth/me/entitlements` returned `plan: free`, `tier: free`, `source: none`, `subscriptionStatus: inactive` at about 10:00 AM, again after the app check, and again after Restore.

**Not known:**

- Whether Apple actually completed the purchase. The sandbox sheet was not seen being confirmed, and I did not check Apple's side.
- Whether the app sent the Apple transaction to the backend. The Railway logs show no request lines, and I did not query the sandbox database.
- Whether Restore found a transaction to send. It changed nothing.
- Any error the app may have shown while I was not looking.

**Next checks:**

1. Have you retry the Member Pro Monthly purchase while I watch the screen and read the app's result right after Subscribe.
2. If it still stays Free, read the app's purchase result and the backend's response to the verify call (needs a one-off Railway command or request logging, with your OK).
3. Check that the sandbox Apple account on the phone is the sandbox tester and that App Store Connect has the sandbox notification URL set.

No code, build, commit or production change was made.

### Follow-up: Member Pro Monthly activated (2026-11-26, about 10:15 AM CT, Build 6)

Apple's checkout showed **US$2.99 per month** and explicitly said that confirming the test purchase would incur no charge. The gray placeholder was still visible in the sheet. Codex tapped **Suscribirse** once, and the user completed Apple authorization on the iPhone.

**App result: Member Pro activated.** Plans displayed “Your plan is active” and “CircuSave confirmed your App Store subscription.” The **Member Pro** card was marked **Your plan** and offered **Manage in App Store**. The Free card was no longer marked current.

**Separate display bug.** The Plans status banner and the Settings subscription row said “Organizer Pro is active.” The Build 6 code uses fixed Organizer Pro copy for paid accounts in those locations. The current-plan card uses `entitlements.tier` and correctly showed Member Pro.

No separate Railway API or database check was run for this attempt. No app code, build, commit, or production change was made.

### Railway sandbox backend check after the Member Pro purchase (2026-11-26, Claude)

**Backend: Member Pro confirmed.** Signed in as `sandbox.tester@example.com`, `GET /api/auth/me/entitlements` on the Railway sandbox returned:

- `plan: premium`, `tier: member_pro`, `source: apple`, `subscriptionStatus: active`
- `currentPeriodEnd: 2026-11-27T16:11:14Z`, `cancelAtPeriodEnd: false`
- Capabilities for Member Pro: 3 hands included, up to 6 hands per person, advanced reports, full activity history, premium reminders, draft and final payout PDFs, AI assistant, 20 members per circle, 1 open circle at a time.

Earlier in the day the same account returned `free`, `source: none`, `inactive`. So the free-to-Member-Pro change is now seen in both the app (Codex's run) and the backend (this check).

**Note on the period end.** It is about one day after the purchase, not one month. Apple's sandbox shortens subscription periods, so this is expected there. Renewal and cancellation still need to be tested.

**Open:** the display bug above ("Organizer Pro is active" on the Plans banner and in Settings for a Member Pro account). The strings are `subscription.active` and `settings.organizerProActive` in all three locales. Not fixed yet.

Production billing is off. No code, build, commit or production change was made in this check.

### Fix: active-plan banner names the actual plan (2026-11-26, Claude, not yet in a build)

The display bug above is fixed in the working tree. Not committed, not in Build 6, not checked on a device.

- **Plans banner** ("… is active"), the **Google Play purchase success title**, the **Settings subscription row** and the **Settings Pro badge** now use the plan name for the account's tier (Member Pro or Organizer Pro) from `entitlements.tier`. A paid account with no readable tier is still treated as Organizer Pro, as `entitlements.ts` already does.
- New copy key `planActive` ("{{plan}} is active") in `subscription` and `settings`, in en, es and ht. The old fixed-name keys (`subscription.active`, `subscription.playSucceededTitle`, `settings.organizerProActive`, `settings.organizerProBadge`) are removed.
- New helper `lib/billing/planName.ts` with `lib/billing/__tests__/planName.test.ts`. Existing tests were updated: the Settings render test now uses a Member Pro account and expects the Member Pro name, and the localization readiness test checks both plan names through the new key.
- `npx tsc --noEmit` is clean and `npm test -- --runInBand` passes (167 suites, 1517 tests).

Still to do on a device: a Member Pro account should show "Member Pro is active" on Plans and in Settings. This needs the next iOS build.

### Restore, renewal and cancellation (2026-11-26, about 10:28 to 10:35 AM CT, Build 6)

Account: `sandbox.tester@example.com`, Member Pro Monthly bought at about 10:11 AM CT (16:11 UTC). Helper: Appium/WebDriverAgent over the restarted tunnel.

**Restore: partial. The app answers, but its answer does not match the backend.**

- With the account on Member Pro, I tapped Restore purchases on Plans. The app showed "Nothing to restore: No active CircuSave subscription was found on this Apple ID." The plan stayed Member Pro, and the backend stayed Member Pro (`source: apple`, `active`) before and after. So restore did not break anything and did not create a duplicate.
- Likely reason: the iPhone has no Apple sandbox account signed in under Settings, Developer, Sandbox Apple Account (the row shows "Iniciar sesión", sign in). Without one, StoreKit has no sandbox subscription to restore. Not confirmed.
- A real restore test (reinstall or sign out and in, then restore, with the sandbox account signed in) has not been run.

**Renewal: not observed.**

- At about 16:27, 16:32 and 16:34 UTC the backend still returned `currentPeriodEnd: 2026-11-27T16:11:14Z`, `active`. That is 16 to 23 minutes after the purchase. Sandbox monthly subscriptions normally renew every 5 minutes, so I expected the period to move.
- The period end is about one day after the purchase, not 5 minutes or a month, which I do not understand. The app says "Renews on November 27, 2026."
- I could not tell whether Apple sent renewal notifications to the sandbox. The Sandbox Server URL in App Store Connect is still unverified, the Railway logs show no request lines, and the sandbox database is only reachable from inside Railway. Not tested further.

**Cancellation: not done.**

- Cancelling a sandbox subscription needs the sandbox account to be signed in on the iPhone (Settings, Developer, Sandbox Apple Account, Manage). It is not signed in, and entering its credentials is yours to do, not mine.
- "Manage in App Store" on the Member Pro card opens the phone's real Apple ID subscription list, not the sandbox one, so it cannot be used to cancel the test subscription. I closed it without recording anything from it.

**New bug found: Google Play wording on iPhone.** On the Organizer Pro card of the iPhone Plans screen, the upgrade button reads "Upgrade to Organizer Pro" and the note under it says "Upgrades start right away. Google Play charges only the difference for the time left." That is Google Play copy shown to an Apple account. Not fixed.

No code, build, commit or production change was made. I left the phone on CircuSave, locked.

### Fix: Google Play wording on iPhone Plans (2026-11-26, Claude, not yet in a build)

The upgrade note under the Organizer Pro card on iPhone said "Upgrades start right away. Google Play charges only the difference for the time left." Fixed in the working tree. Not committed, not in Build 6, not checked on a device.

- `TierPlansSection` takes an optional `upgradeNote`. The iPhone Plans screen passes a new `tierUpgradeNoteApple` ("Upgrades start right away. The App Store adjusts the charge for the time left on your current plan."), in en, es and ht. Android still shows the Google Play note.
- The other Google Play strings in the plan cards were already store-specific or only reachable on Android (the manage link and footer switch by platform, and the billing-period alert is part of the Android purchase flow). I did not change them.
- New test `lib/billing/__tests__/tierUpgradeNoteStore.test.ts`. `npx tsc --noEmit` is clean and `npm test -- --runInBand` passes (168 suites, 1521 tests).

The wording of the Apple note is my own and says the App Store "adjusts the charge". Please confirm it matches how Apple prorates upgrades in your subscription group before release.
