# Notifications invariants

## Entries and permission

- Settings opens the notification preference screen. The toggle reflects both the app preference
  and the system authorization status; denied permission exposes an explicit Open Settings action.
- `NotificationCoordinator` installs the system delegate, observes every paired host's notification
  stream, schedules local notifications, handles dismiss events, and routes a tapped notification
  to the matching host/workspace after the app is ready.

## Replay and persistence

- Ready events establish a subscription and replay events after the host-scoped sequence watermark.
  Seen IDs are bounded and deduplicated; reconnects never schedule the same notification twice.
- Watermarks live in `UserDefaults` under the host-specific key. Pending route delivery is held until
  navigation registers a route handler, then consumed once.
- Dismiss events remove pending and delivered requests. If a notification is being scheduled, the
  dismissal is applied after the schedule completes. Removing a host cancels its observation task.
- Permission denial, stream errors, and cancellation are non-fatal to the rest of the app. The
  coordinator retries the host stream after a short delay without inventing an event.

## Visual and lifecycle contract

- Foreground presentation uses the system banner/list/sound policy. The settings page refreshes on
  appearance and foreground activation so a user returning from Settings sees the real permission.
- Toggle, loader, icon, and copy follow the shared Settings spacing and neutral color rules. The
  notification feature never uses blue as a loading/action tint or adds a gradient surface.
