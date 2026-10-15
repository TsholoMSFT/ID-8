# Live Discovery Feature - Browser APIs & Compatibility Research

**Author:** Tsholo K. Setati  
**Project:** ID-8 (Microsoft Innovation Hub Enterprise Discovery)

## Executive Summary

The Live Discovery feature in ID-8 relies primarily on the **Web Speech API** for voice input functionality. My analysis shows the implementation demonstrates awareness of browser compatibility issues with clear fallback mechanisms, though there are some missing error handling scenarios and browser-specific considerations that I identified for improvement.

---

## 1. Browser APIs & Capabilities Used

### 1.1 Web Speech API (Primary Dependency)
**Location**: [src/hooks/use-speech-recognition.ts](src/hooks/use-speech-recognition.ts)

#### API Details
- **Standard Interface**: `SpeechRecognition` API (with webkit prefix fallback)
- **Detection Pattern**: 
  ```typescript
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  isSupported.current = !!SpeechRecognition
  ```

#### Configuration Settings
- `continuous: true` - Allows continuous speech input instead of stopping at silence
- `interimResults: true` - Captures real-time transcription as user speaks
- `language: 'en-US'` - Default language (configurable via props)

#### Features Utilized
- **Real-time Transcription**: Distinguishes between interim and final results
- **Continuous Listening**: Stays active until explicitly stopped
- **Transcript Accumulation**: Concatenates multiple spoken segments
- **Language Support**: Configurable language parameter (default en-US)

---

## 2. Browser Compatibility Matrix

### 2.1 Official Browser Support Status

| Browser | Live Discovery | Support Level | Notes |
|---------|-----------------|---------------|-------|
| **Chrome** | ✅ Full | Excellent | Primary development browser; fully featured Web Speech API |
| **Edge** | ✅ Full | Excellent | Chromium-based; equivalent to Chrome support |
| **Safari** | ✅ Partial | Good | Web Speech API supported (macOS 14.1+, iOS 14.5+) |
| **Firefox** | ❌ Not Supported | None | No Web Speech API support; no webkit fallback |
| **Opera** | ✅ Full | Excellent | Chromium-based; equivalent to Chrome |

### 2.2 Current Implementation Messaging
**From README.md**:
> "Recommended: Chrome, Edge (best support for Live Discovery voice features)"
> "Supported: Safari, Firefox (Standard Discovery fully supported)"
> "Note: Live Discovery requires Web Speech API support"

**From LiveDiscoveryMode.tsx** (unsupported browser fallback):
```typescript
"Your browser doesn't support the Web Speech API. Please use Chrome, Edge, or Safari instead."
```

### 2.3 Safari-Specific Considerations
- **macOS Support**: Web Speech API available on macOS 14.1+
- **iOS Support**: Web Speech API available on iOS 14.5+
- **Older Versions**: No Web Speech API support on earlier Safari/iOS versions
- **Behavior Quirk**: Safari may handle continuous mode differently than Chromium
- **Microphone Permissions**: Requires user interaction and HTTPS (see below)

### 2.4 Platform-Specific Requirements

#### HTTPS Requirement
⚠️ **Critical**: The Web Speech API typically requires HTTPS or localhost
- Production deployments must use HTTPS
- Development on localhost works without HTTPS
- HTTP deployments will silently fail or be blocked

#### Microphone Permissions
- **First-time Access**: Browser shows permission prompt to access microphone
- **User Approval**: Required before speech recognition can start
- **Permission Storage**: Browser remembers user's choice (allow/deny)
- **https://localhost** - Typically auto-granted for development

---

## 3. Error Handling Analysis

### 3.1 Current Error Handling in use-speech-recognition.ts

#### Speech Recognition Errors Handled
```typescript
recognition.onerror = (event: any) => {
  if (event.error === 'aborted') {
    return  // Silently ignored
  }
  if (event.error === 'no-speech') {
    return  // Silently ignored
  }
  const errorMessage = `Speech recognition error: ${event.error}`
  setError(errorMessage)
  setIsListening(false)
  onError?.(errorMessage)
}
```

#### Errors Currently Handled
1. **'aborted'** - Silently ignored (expected when user stops)
2. **'no-speech'** - Silently ignored (user hasn't spoken)
3. **All other errors** - Caught and reported via `onError` callback

#### Error Types Not Explicitly Handled
- `'network-error'` - Network issue during transmission
- `'bad-grammar'` - Server rejected the grammar
- `'service-not-available'` - Speech API unavailable
- `'audio-capture'` - No microphone available
- `'permission-denied'` - User denied microphone access (handled implicitly)
- `'speech-timeout'` - Timeout waiting for more speech

### 3.2 Start/Stop Error Handling
```typescript
const startListening = useCallback(() => {
  if (recognitionRef.current && !isListening && !isStartingRef.current) {
    try {
      isStartingRef.current = true
      recognitionRef.current.start()
    } catch (error: any) {
      isStartingRef.current = false
      if (error.name !== 'InvalidStateError') {
        console.error('Failed to start speech recognition:', error)
        setError('Failed to start speech recognition')
      }
    }
  }
}, [isListening])
```

#### Specific Handling
- **InvalidStateError** - Silently ignored (API already started)
- **Other errors** - Logged and state updated
- **Try-catch wrapper** - Catches exceptions from `.start()` method

### 3.3 Browser Support Detection Error Handling
**In LiveDiscoveryMode.tsx**:
```typescript
if (!isSupported) {
  return (
    <Card className="border-2 border-destructive/30">
      <CardTitle className="text-2xl">Speech Recognition Not Supported</CardTitle>
      <CardDescription className="text-base mt-2">
        Your browser doesn't support the Web Speech API. 
        Please use Chrome, Edge, or Safari instead.
      </CardDescription>
      <Button variant="outline" onClick={onCancel}>Cancel</Button>
      <Button variant="outline" onClick={() => window.history.back()}>Go Back</Button>
    </Card>
  )
}
```

**Handling Method**: Full page replacement with user-friendly error UI

---

## 4. Fallback Mechanisms

### 4.1 Manual Text Input Fallback
**Location**: LiveDiscoveryMode.tsx, Manual Override feature

Users can manually type or edit answers without voice input:
```typescript
<button onClick={() => setUseManualInput(!useManualInput)}>
  {useManualInput ? 'Switch back to voice' : 'Edit or type manually'}
</button>

{useManualInput && (
  <Textarea
    value={manualOverride}
    onChange={(e) => setManualOverride(e.target.value)}
    placeholder={currentQuestion.placeholder}
  />
)}
```

**Benefit**: Users can bypass voice entirely and type responses

### 4.2 Switch to Standard Mode Fallback
**Location**: LiveDiscoveryMode.tsx, Mode Switching

Users experiencing issues with Live Discovery can switch to Standard (text-based) Discovery:
```typescript
{onSwitchToStandard && (
  <Button 
    onClick={() => {
      const filteredResponses = responses.filter(...)
      const updatedResponses = fullTranscript.trim()
        ? [...filteredResponses, { ... }]
        : filteredResponses
      onSwitchToStandard(sessionName, selectedIndustry, updatedResponses)
    }}
  >
    <Keyboard size={18} weight="fill" />
    Switch to Standard
  </Button>
)}
```

**Benefit**: Complete mode switch preserves previous answers

### 4.3 AI Feature Fallbacks
- **Insight Generation Failure**: Toast error shown, user continues without insight
- **Follow-up Question Generation Failure**: Returns empty array, user continues to next question
- **No blocking**: AI failures never prevent workflow progression

---

## 5. Known Compatibility Issues & Edge Cases

### 5.1 Browser-Specific Issues

#### Chrome/Edge (Chromium)
- ✅ Full support
- Reliable continuous mode
- Excellent interim results
- Handles long transcripts well

#### Safari
- ⚠️ **Version dependent** - Requires macOS 14.1+ or iOS 14.5+
- ⚠️ **Different behavior** - May have different interim/final result handling
- ⚠️ **HTTPS enforced** - May be stricter about HTTPS requirement
- ⚠️ **Timeout handling** - May have shorter timeouts than Chromium

#### Firefox
- ❌ **No support** - Web Speech API not implemented
- **Current behavior**: Shows "not supported" message and blocks Live Discovery
- **Fallback available**: Standard Discovery works fine

#### Older Safari (pre-14.1)
- ❌ **No support** - Web Speech API not available
- **Current behavior**: Would show "not supported" message

### 5.2 Platform-Specific Issues

#### Mobile/iOS Safari
- ⚠️ **Limited microphone access** - iOS limitations on web audio
- ⚠️ **Permission handling** - May show different permission prompts
- ⚠️ **Continuous mode quirks** - May not work as expected
- ⚠️ **Browser behavior** - Users may not expect voice input on mobile

#### Linux Chrome/Firefox
- ✅ Chrome: Full support
- ❌ Firefox: No support
- ⚠️ May require additional system packages for audio capture

### 5.3 Network & Permission Issues

#### Missing Microphone Permission Detection
**Issue**: If user denies microphone access, the error is caught in `recognition.onerror` as a generic error
```typescript
// Current handling:
if (event.error === 'permission-denied') {
  // NOT explicitly handled - falls through to generic error
  const errorMessage = `Speech recognition error: ${event.error}`
}
```

**Missing**: Specific handling for permission denied to guide user to browser settings

#### HTTPS Requirements Not Documented
- **Issue**: No warning if app is served over HTTP
- **Silent Failure**: Web Speech API may simply not work without clear error
- **Missing**: Detection and warning about HTTPS requirement

#### Network Connection Issues
**Issue**: Network errors are caught but not distinguished from other errors
- `'network-error'` would be treated as generic error
- No specific guidance on reconnection or retry strategy

### 5.4 Language Support Edge Cases
```typescript
language: 'en-US' // Default, but configurable
```

**Current State**:
- Only en-US is used in the codebase
- Hook supports any language via prop
- No validation of language codes
- No detection of user's browser language preferences

---

## 6. Missing Error Handling & Fallback Scenarios

### 6.1 Critical Gaps

#### 1. **Microphone Permission Denied**
```
Current: Generic error message "Speech recognition error: permission-denied"
Needed: 
  - Specific message: "Microphone access denied"
  - Instructions: "Allow microphone access in your browser settings"
  - Option: "Retry" button to request permission again
```

#### 2. **Microphone Not Available**
```
Current: Caught as 'audio-capture' error, treated generically
Needed:
  - Specific detection: `event.error === 'audio-capture'`
  - Message: "No microphone detected on this device"
  - Fallback: Force switch to manual text input
```

#### 3. **Timeout During Continuous Recording**
```
Current: Would be caught as generic error
Needed:
  - Handle 'speech-timeout' explicitly
  - Option to resume/restart listening
  - Don't lose accumulated transcript
```

#### 4. **HTTPS Requirement**
```
Current: No detection or warning
Needed:
  - Detect if running on HTTP
  - Show warning before attempting Live Discovery
  - Disable Live Discovery on insecure connections
```

#### 5. **Network/Service Unavailable**
```
Current: 'network-error' treated generically
Needed:
  - Distinguish from user speech issues
  - Show specific message: "Speech recognition service unavailable"
  - Option to retry or switch modes
```

#### 6. **Browser Doesn't Support Continuous Mode**
```
Current: No fallback if continuous mode fails
Needed:
  - Detect if continuous mode unavailable
  - Fall back to single-utterance mode
  - Adjust UI to show restart button between utterances
```

### 6.2 UX/Information Gaps

#### 1. **Missing Browser Detection Before Loading**
```typescript
// Current: Detects on component load, shows full-page error
// Better: Could detect in setup phase, warn before starting

function LiveDiscoverySetup() {
  // No check if browser supports speech before user enters session name
  // Should validate browser support here with clear messaging
}
```

#### 2. **No Graceful Degradation on Mobile Safari**
```typescript
// Current: Same UI for all browsers
// Better: Could adapt UI for Safari's limitations
// - Disable continuous mode indicator
// - Show different instructions for iOS users
// - Adjust timeout expectations
```

#### 3. **Missing Transcript Persistence on Error**
```typescript
// If error occurs mid-speech, accumulated transcript is lost
// Better: Store interim transcript and allow recovery
```

#### 4. **No Feedback for Silent Users**
```typescript
// Current: 'no-speech' error silently ignored
// Better: Show visual feedback after timeout
// "No speech detected - Please start speaking"
```

#### 5. **No Language Selection in UI**
```typescript
// Language hardcoded to en-US
// Missing: UI to select language
// Missing: Browser language auto-detection
```

### 6.3 Architectural Gaps

#### 1. **No Fallback Chain**
```
Current: Speech error → Show generic error → Manual input only
Better: 
  1. Try Web Speech API
  2. If unsupported → Try WebRTC/getUserMedia (more complex)
  3. If still fails → Manual input only
```

#### 2. **No Offline Detection**
```typescript
// Current: Network errors not distinguished
// Missing: 
//   - navigator.onLine check
//   - Detect offline and disable Live Discovery
```

#### 3. **No Device Capability Detection**
```typescript
// Current: Only checks SpeechRecognition support
// Missing:
//   - Check microphone available via navigator.mediaDevices.enumerateDevices()
//   - Check HTTPS via location.protocol
//   - Check permission status via Permissions API
```

---

## 7. Browser API Details & Constraints

### 7.1 Web Speech API Specifications

#### Recognition Events & Lifecycle
```typescript
// Events fired in order:
1. onstart      // User started speaking or start() called
2. onresult     // Speech received (interim or final)
3. onend        // Speech recognition ended or stop() called
4. onerror      // Error occurred at any point
```

#### Key Constraints
- **Single instance** - Can't have multiple recognitions running simultaneously
- **No audio stream access** - API doesn't expose raw audio data
- **No confidence scores** - Individual words lack confidence metrics
- **Server-side processing** - Browser sends audio to server (privacy consideration)

### 7.2 Microphone Access

#### Permission Requirements
```typescript
// Web Speech API uses browser's microphone permission
// Same as:
// - WebRTC video/audio calls
// - MediaRecorder API
// - getUserMedia() API
```

#### Security Constraints
- **HTTPS required** (except localhost)
- **User gesture not required** (but good UX to wait for user action)
- **Permission prompt once per site**
- **User can revoke in browser settings**

### 7.3 Transcript Handling

#### Current Implementation
```typescript
// Accumulates transcripts:
final += transcriptSegment + ' '
const newTranscript = transcriptRef.current + final
```

#### Limitations
- Manual concatenation with spaces
- No punctuation handling
- No sentence detection
- No confidence scoring per segment

---

## 8. Testing Recommendations

### 8.1 Browser Testing Matrix

```
Chrome (latest)        ✅ Full test
Chrome (latest-1)      ✅ Full test
Edge (latest)          ✅ Full test
Safari (14.1+)         ✅ Full test with iOS variant
Safari (< 14.1)        ✅ Verify unsupported message
Firefox (latest)       ✅ Verify unsupported message
Firefox (older)        ✅ Verify unsupported message
```

### 8.2 Scenario Testing

#### Permission Scenarios
- [ ] First time: Accept microphone permission
- [ ] First time: Deny microphone permission
- [ ] Subsequent: Permission already granted
- [ ] Subsequent: Permission revoked in settings

#### Network Scenarios
- [ ] HTTPS with network connection (normal)
- [ ] HTTP (should warn or fail gracefully)
- [ ] Network disconnect during speech (should error clearly)
- [ ] Slow network (should handle timeouts)

#### Device Scenarios
- [ ] Desktop with USB microphone
- [ ] Laptop built-in microphone
- [ ] Mobile device (iOS/Android)
- [ ] No microphone available
- [ ] Microphone in use by another app

#### Edge Cases
- [ ] User speaks during setup
- [ ] User mutes microphone after starting
- [ ] User speaks in non-English language
- [ ] Very long utterance (> 30 seconds)
- [ ] Very quiet speech
- [ ] Very loud background noise
- [ ] Multiple speakers
- [ ] Rapid mode switching

### 8.3 Error Scenario Testing

```
Test Case: Microphone Permission Denied
├─ Expected: Clear message about permission
├─ Actual: Generic "speech recognition error: permission-denied"
└─ Status: ❌ NEEDS IMPROVEMENT

Test Case: No Microphone Hardware
├─ Expected: Specific message about missing device
├─ Actual: Generic error or no error
└─ Status: ❌ NEEDS IMPROVEMENT

Test Case: Network Unavailable
├─ Expected: Network-specific error message
├─ Actual: Generic error
└─ Status: ❌ NEEDS IMPROVEMENT

Test Case: Firefox Browser
├─ Expected: Unsupported message with option to use Standard
├─ Actual: ✅ Shows proper unsupported message
└─ Status: ✅ WORKING

Test Case: Safari < 14.1
├─ Expected: Unsupported message
├─ Actual: ✅ Shows proper unsupported message
└─ Status: ✅ WORKING (assuming no feature detection issue)
```

---

## 9. Summary Table

### APIs & Capabilities Used
| API/Capability | Status | Browser Support | Fallback |
|---|---|---|---|
| Web Speech API | Primary | Chrome, Edge, Safari | Manual text input |
| SpeechRecognition continuous mode | Required | Chrome, Edge, Safari | N/A |
| Interim results | Recommended | Chrome, Edge, Safari | Works without |
| Microphone permission | Required | All browsers | N/A |
| HTTPS | Required (prod) | N/A | None |

### Error Handling Completeness
| Error Type | Handled | User Feedback | Guidance |
|---|---|---|---|
| Browser not supported | ✅ | ✅ | ✅ Clear message |
| Microphone permission denied | ⚠️ Partial | ❌ Generic | ❌ No instructions |
| No microphone hardware | ❌ | ❌ Generic | ❌ No guidance |
| Network error | ⚠️ Partial | ❌ Generic | ❌ No retry logic |
| HTTP not HTTPS | ❌ | ❌ No warning | ❌ Silent failure |
| Service unavailable | ⚠️ Partial | ❌ Generic | ❌ No fallback |
| Speech timeout | ✅ Implicit | ❌ No feedback | ❌ No UI cue |
| No speech detected | ✅ Implicit | ❌ Silently ignored | ❌ User confused |

### Fallback Mechanisms Available
| Fallback | Status | Mechanism |
|---|---|---|
| Manual text input | ✅ Working | Edit/Type button |
| Switch to Standard Discovery | ✅ Working | Mode switch button |
| AI features (non-blocking) | ✅ Working | Toast error, continue |
| Browser not supported | ✅ Working | Full page message |
| No microphone detected | ❌ Missing | N/A |
| HTTP/HTTPS issue | ❌ Missing | N/A |
| Network/timeout recovery | ❌ Missing | N/A |

---

## 10. Recommendations for Improvement

### High Priority
1. **Add specific error messaging for microphone permission denial**
2. **Detect and warn about HTTPS requirement**
3. **Implement proper timeout feedback to user**
4. **Add microphone availability detection**
5. **Handle network errors with specific messaging**

### Medium Priority
1. **Add language selection UI**
2. **Improve mobile Safari support with adaptive UI**
3. **Add offline mode detection**
4. **Implement transcript recovery on errors**
5. **Add browser detection in setup phase**

### Low Priority
1. **Explore WebRTC fallback (complex, limited benefit)**
2. **Add confidence scoring display**
3. **Support multiple microphone selection**
4. **Add voice quality indicators**
5. **Implement audio recording for debugging**

---

## Files Analyzed

1. [src/components/LiveDiscoveryMode.tsx](src/components/LiveDiscoveryMode.tsx) - Main Live Discovery component
2. [src/components/LiveDiscoverySetup.tsx](src/components/LiveDiscoverySetup.tsx) - Setup wizard
3. [src/hooks/use-speech-recognition.ts](src/hooks/use-speech-recognition.ts) - Speech API hook
4. [src/lib/types.ts](src/lib/types.ts) - Type definitions
5. [README.md](README.md) - Browser compatibility documented
6. [AI-FEATURES.md](AI-FEATURES.md) - Feature documentation

