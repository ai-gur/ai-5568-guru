# Authoring mobile apps for IS 5568

The Service Accessibility Regulations cover mobile applications, not only
websites. IS 5568's criteria are written for web content, so they are applied to
apps by analogy: the principle is identical, the platform API differs.

Read `hebrew-rtl-patterns.md` alongside this for Hebrew content.

## Accessible names

Every interactive element needs a name. Icon-only controls are the usual gap.

```swift
// iOS / SwiftUI
Button(action: close) { Image(systemName: "xmark") }
    .accessibilityLabel("סגור")

// Decorative image — hide it rather than letting VoiceOver read the asset name
Image("divider").accessibilityHidden(true)
```

```kotlin
// Android / Compose
IconButton(onClick = ::close) {
    Icon(Icons.Default.Close, contentDescription = "סגור")
}
// Decorative
Icon(painterResource(R.drawable.divider), contentDescription = null)
```

```jsx
// React Native
<Pressable accessibilityRole="button" accessibilityLabel="סגור" onPress={close}>
  <Image source={closeIcon} accessible={false} />
</Pressable>
```

`contentDescription = null` (Android) and `accessible={false}` (RN) mean
"decorative" — an empty string is not the same thing and behaves inconsistently.

## Roles and state

Announce what an element *is* and what state it is in, not just its label.

```swift
Toggle("קבלת התראות", isOn: $enabled)          // role and state come free
Text("שעות פעילות")
    .accessibilityAddTraits(.isHeader)          // headings exist on mobile too
```

```kotlin
Modifier.semantics {
    role = Role.Button
    stateDescription = if (expanded) "מורחב" else "מכווץ"
    heading()
}
```

```jsx
<Pressable
  accessibilityRole="button"
  accessibilityState={{ expanded }}
  accessibilityLabel="שעות פעילות"
/>
```

Mark headings. Screen-reader users navigate long screens by heading, exactly as
on the web.

## Touch targets

Minimum 44×44pt (iOS) / 48×48dp (Android). This is a motor-accessibility
requirement, not a design preference. Increase the hit area rather than the
visual size when the design needs a small icon.

## Dynamic type

Text must scale with the OS text-size setting without clipping or loss of
function — the mobile equivalent of criterion 1.4.4.

```swift
Text("...").font(.body)          // scales; a fixed .system(size: 14) does not
```

```kotlin
fontSize = 16.sp                  // sp scales; dp does not
```

Test at the largest accessibility text size. Fixed-height containers holding
text are the usual failure.

## RTL layout

```swift
// iOS mirrors automatically with leading/trailing; avoid .left / .right
HStack { ... }.environment(\.layoutDirection, .rightToLeft)
Text("...").multilineTextAlignment(.leading)
```

```xml
<!-- Android: use start/end, never left/right -->
<TextView
    android:layout_marginStart="16dp"
    android:textAlignment="viewStart" />
```

```jsx
// React Native
import { I18nManager } from 'react-native';
I18nManager.forceRTL(true);   // requires an app restart to take effect
// Use marginStart / paddingEnd, never marginLeft / paddingRight
```

Mirror directional icons (back, next, progress). Do not mirror logos,
checkmarks or media play buttons.

LTR islands — phone numbers, IDs, order references inside Hebrew text — need
isolating on mobile too. Wrap them with U+2068 (FSI) and U+2069 (PDI), or use a
separate text run with an explicit LTR direction.

## Focus and navigation order

- The screen-reader focus order should follow the visual order. On iOS set
  `accessibilityElements` where the inferred order is wrong; on Android use
  `android:accessibilityTraversalAfter`.
- Move focus to newly presented content (modals, sheets) and return it to the
  trigger on dismissal.
- Announce asynchronous changes:

```swift
UIAccessibility.post(notification: .announcement, argument: "הטופס נשלח בהצלחה")
```

```kotlin
view.announceForAccessibility("הטופס נשלח בהצלחה")
```

```jsx
AccessibilityInfo.announceForAccessibility('הטופס נשלח בהצלחה');
```

## Forms

- Every field has a visible label, not just a placeholder.
- Errors are announced, associated with the field, and say how to fix it.
- Use the right keyboard type (`numberPad`, `emailAddress`) and text content
  type — it helps everyone.

## Motion

Honour the OS reduce-motion setting:

```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion
```

```kotlin
Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f)
```

```jsx
AccessibilityInfo.isReduceMotionEnabled()
```

Auto-advancing carousels need a pause control regardless of the OS setting.

## Verify

- **iOS**: Settings → Accessibility → VoiceOver. Also run the Accessibility
  Inspector audit in Xcode.
- **Android**: Settings → Accessibility → TalkBack. Also run **Accessibility
  Scanner** from the Play Store.
- Test at the largest text size, in RTL, with the screen reader on, using
  gestures only.

There is no equivalent of an automated HTML audit for apps — the platform
inspectors catch missing labels and small targets, and nothing else. Manual
screen-reader testing is the primary method, not a supplement.
