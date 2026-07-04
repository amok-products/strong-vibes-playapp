# ESP32 Knob Controller — Firmware Skill

This document describes how to build firmware for an ESP32-S3 rotary knob controller that pairs with the Strong Vibes Playapp via Bluetooth Low Energy (BLE). The knob acts as a physical remote control, sending rotation and button events to the web app and displaying current state on a small TFT screen.

## Architecture

```
[ESP32-S3 Knob] --BLE GATT--> [Browser Web App] --BLE GATT--> [EMW Massager]
```

The ESP32 is a **BLE peripheral** (GATT server). The browser connects to it as a central. The knob sends notifications for rotation and button events; the browser writes display data back.

## GATT Service Definition

**Service UUID:** `0000A001-1313-71be-1221-785dfeabc321`

| Characteristic | UUID Short | Properties | Description |
|---|---|---|---|
| Knob Value | `A002` | Notify | Rotary encoder value changes |
| Button State | `A003` | Notify | Button press/release/long/double events |
| Display Data | `A004` | Write | JSON data for the onboard display |
| Device Info | `A005` | Read | Static device metadata |

Full UUID format: `0000XXXX-1313-71be-1221-785dfeabc321` where `XXXX` is the short ID.

### Knob Value (A002) — Notify

3 bytes: `[mode, valueHi, valueLo]`

| Byte | Description |
|---|---|
| 0 | Mode: `0x01` = absolute, `0x02` = relative |
| 1-2 | Value (big-endian uint16 for absolute 0-65535, or signed int8 delta in byte 1 for relative) |

**Absolute mode (0x01):** Reports the current encoder position as a 16-bit value. The app normalizes 0-255 range to 0-100% for intensity or 0.5x-2.0x for speed.

**Relative mode (0x02):** Reports signed delta since last notification. Byte 1 is a signed int8 (-128 to +127). Byte 2 is unused (0x00). Clockwise = positive, counter-clockwise = negative.

### Button State (A003) — Notify

2 bytes: `[buttonId, event]`

| Byte | Description |
|---|---|
| 0 | Button ID (0x01 for the main push-button on the encoder) |
| 1 | Event type |

Event types:
- `0x01` — Press (button down)
- `0x02` — Release (button up)
- `0x03` — Long press (held > 500ms)
- `0x04` — Double press (two presses within 300ms)

The app maps these to actions:
- Press → Play/Stop
- Long press → Next pattern
- Double press → Toggle loop

### Display Data (A004) — Write

UTF-8 encoded JSON string, max 128 bytes:

```json
{"n":"Gentle Wave","s":"playing","m":75}
```

| Field | Type | Description |
|---|---|---|
| `n` | string | Pattern name (truncated to 20 chars) |
| `s` | string | State: `"playing"` or `"idle"` |
| `m` | number | MIC/intensity level (0-100) |

### Device Info (A005) — Read

UTF-8 encoded JSON:

```json
{"type":"knob","version":1,"name":"Strong Vibes Knob v1"}
```

## Hardware

### Recommended Components

- **MCU:** ESP32-S3 DevKitC-1 (built-in USB, BLE 5.0)
- **Encoder:** KY-040 rotary encoder module (CLK, DT, SW pins)
- **Display:** 1.8" ST7735 128x160 TFT SPI module (or 1.28" GC9A01 240x240 round)
- **Power:** USB-C from DevKit or LiPo battery with TP4056 charger

### Pin Assignments (suggested)

| Function | GPIO |
|---|---|
| Encoder CLK (A) | GPIO 4 |
| Encoder DT (B) | GPIO 5 |
| Encoder SW (button) | GPIO 6 |
| TFT MOSI (SDA) | GPIO 11 |
| TFT SCK (CLK) | GPIO 12 |
| TFT CS | GPIO 10 |
| TFT DC (A0) | GPIO 13 |
| TFT RST | GPIO 14 |
| TFT BL (backlight) | GPIO 15 |

## Project Structure (PlatformIO)

```
strong-vibes-knob-firmware/
  platformio.ini
  src/
    main.cpp          — Setup and main loop
    ble_service.h     — BLE service setup and notification helpers
    ble_service.cpp
    encoder.h         — Rotary encoder reading (PCNT or interrupt)
    encoder.cpp
    button.h          — Button state machine (press/long/double)
    button.cpp
    display.h         — TFT display rendering
    display.cpp
  lib/                — External libraries (managed by PlatformIO)
```

### platformio.ini

```ini
[env:esp32s3]
platform = espressif32
board = esp32-s3-devkitc-1
framework = arduino
lib_deps =
  h2zero/NimBLE-Arduino@^1.4.0
  bodmer/TFT_eSPI@^2.5.0
  madhephaestus/ESP32Encoder@^0.10.1
monitor_speed = 115200
build_flags =
  -D USER_SETUP_LOADED=1
  -D ST7735_DRIVER=1
  -D TFT_WIDTH=128
  -D TFT_HEIGHT=160
  -D TFT_MOSI=11
  -D TFT_SCLK=12
  -D TFT_CS=10
  -D TFT_DC=13
  -D TFT_RST=14
  -D SPI_FREQUENCY=40000000
```

## Implementation Guide

### 1. BLE Service (NimBLE-Arduino)

```cpp
#include <NimBLEDevice.h>

// UUIDs
#define SERVICE_UUID        "0000a001-1313-71be-1221-785dfeabc321"
#define KNOB_VALUE_UUID     "0000a002-1313-71be-1221-785dfeabc321"
#define BUTTON_STATE_UUID   "0000a003-1313-71be-1221-785dfeabc321"
#define DISPLAY_DATA_UUID   "0000a004-1313-71be-1221-785dfeabc321"
#define DEVICE_INFO_UUID    "0000a005-1313-71be-1221-785dfeabc321"

NimBLECharacteristic* knobChar;
NimBLECharacteristic* buttonChar;
NimBLECharacteristic* displayChar;

void setupBLE() {
  NimBLEDevice::init("Strong Vibes Knob");
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);

  NimBLEServer* server = NimBLEDevice::createServer();
  NimBLEService* service = server->createService(SERVICE_UUID);

  knobChar = service->createCharacteristic(
    KNOB_VALUE_UUID,
    NIMBLE_PROPERTY::NOTIFY
  );

  buttonChar = service->createCharacteristic(
    BUTTON_STATE_UUID,
    NIMBLE_PROPERTY::NOTIFY
  );

  displayChar = service->createCharacteristic(
    DISPLAY_DATA_UUID,
    NIMBLE_PROPERTY::WRITE
  );
  // Set a callback to handle display data writes
  displayChar->setCallbacks(new DisplayWriteCallback());

  NimBLECharacteristic* infoChar = service->createCharacteristic(
    DEVICE_INFO_UUID,
    NIMBLE_PROPERTY::READ
  );
  infoChar->setValue("{\"type\":\"knob\",\"version\":1}");

  service->start();

  NimBLEAdvertising* adv = NimBLEDevice::getAdvertising();
  adv->addServiceUUID(SERVICE_UUID);
  adv->setScanResponse(true);
  adv->start();
}
```

### 2. Rotary Encoder

Two approaches:

**Option A: ESP32 PCNT (Hardware Counter)**
```cpp
#include <ESP32Encoder.h>

ESP32Encoder encoder;
int32_t lastPosition = 0;

void setupEncoder() {
  encoder.attachHalfQuad(4, 5);  // CLK, DT
  encoder.setCount(0);
}

void readEncoder() {
  int32_t pos = encoder.getCount();
  if (pos != lastPosition) {
    // Clamp to 0-255 for absolute mode
    pos = constrain(pos, 0, 255);
    encoder.setCount(pos);

    uint8_t data[3] = {
      0x01,                    // Absolute mode
      (uint8_t)(pos >> 8),     // Value high byte
      (uint8_t)(pos & 0xFF)    // Value low byte
    };
    knobChar->setValue(data, 3);
    knobChar->notify();
    lastPosition = pos;
  }
}
```

**Option B: Interrupt-based (Relative Mode)**
```cpp
volatile int8_t encoderDelta = 0;

void IRAM_ATTR encoderISR() {
  // Read direction from DT pin state
  if (digitalRead(DT_PIN)) encoderDelta++;
  else encoderDelta--;
}

void readEncoderRelative() {
  if (encoderDelta != 0) {
    int8_t delta = encoderDelta;
    encoderDelta = 0;

    uint8_t data[3] = {
      0x02,                    // Relative mode
      (uint8_t)delta,          // Signed delta
      0x00                     // Unused
    };
    knobChar->setValue(data, 3);
    knobChar->notify();
  }
}
```

### 3. Button State Machine

```cpp
enum ButtonState { IDLE, PRESSED, WAIT_DOUBLE };

ButtonState btnState = IDLE;
unsigned long pressTime = 0;
unsigned long releaseTime = 0;
const unsigned long LONG_PRESS_MS = 500;
const unsigned long DOUBLE_PRESS_MS = 300;

void sendButtonEvent(uint8_t buttonId, uint8_t event) {
  uint8_t data[2] = { buttonId, event };
  buttonChar->setValue(data, 2);
  buttonChar->notify();
}

void updateButton() {
  bool pressed = !digitalRead(BUTTON_PIN);  // Active low
  unsigned long now = millis();

  switch (btnState) {
    case IDLE:
      if (pressed) {
        pressTime = now;
        btnState = PRESSED;
        sendButtonEvent(0x01, 0x01);  // Press
      }
      break;

    case PRESSED:
      if (!pressed) {
        unsigned long held = now - pressTime;
        sendButtonEvent(0x01, 0x02);  // Release

        if (held >= LONG_PRESS_MS) {
          sendButtonEvent(0x01, 0x03);  // Long press
          btnState = IDLE;
        } else {
          releaseTime = now;
          btnState = WAIT_DOUBLE;
        }
      } else if (now - pressTime >= LONG_PRESS_MS) {
        sendButtonEvent(0x01, 0x03);  // Long press (while held)
        // Wait for release before returning to IDLE
      }
      break;

    case WAIT_DOUBLE:
      if (pressed) {
        sendButtonEvent(0x01, 0x04);  // Double press
        btnState = PRESSED;
        pressTime = now;
      } else if (now - releaseTime >= DOUBLE_PRESS_MS) {
        btnState = IDLE;  // Single press confirmed (no action needed, already sent)
      }
      break;
  }
}
```

### 4. TFT Display

```cpp
#include <TFT_eSPI.h>
#include <ArduinoJson.h>

TFT_eSPI tft = TFT_eSPI();

String currentName = "";
String currentState = "idle";
int currentMic = 0;

void setupDisplay() {
  tft.init();
  tft.setRotation(1);  // Landscape
  tft.fillScreen(TFT_BLACK);
  tft.setTextColor(TFT_WHITE, TFT_BLACK);
  drawUI();
}

void drawUI() {
  tft.fillScreen(TFT_BLACK);

  // Pattern name (top)
  tft.setTextDatum(TC_DATUM);
  tft.setTextSize(1);
  tft.drawString(currentName.isEmpty() ? "No Pattern" : currentName, 80, 10);

  // State indicator (middle)
  uint16_t color = currentState == "playing" ? TFT_GREEN : TFT_DARKGREY;
  tft.fillCircle(80, 50, 8, color);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(currentState, 80, 65);

  // MIC level bar (bottom)
  int barWidth = map(currentMic, 0, 100, 0, 120);
  tft.fillRect(20, 100, 120, 16, TFT_DARKGREY);
  tft.fillRect(20, 100, barWidth, 16, TFT_CYAN);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(String(currentMic) + "%", 80, 120);
}

// Called when the browser writes to A004
class DisplayWriteCallback : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pChar) override {
    std::string val = pChar->getValue();
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, val.c_str()) == DeserializationError::Ok) {
      currentName = doc["n"].as<const char*>();
      currentState = doc["s"].as<const char*>();
      currentMic = doc["m"].as<int>();
      drawUI();
    }
  }
};
```

### 5. Main Loop

```cpp
void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  setupDisplay();
  setupEncoder();
  setupBLE();

  Serial.println("Strong Vibes Knob ready");
}

void loop() {
  readEncoder();     // Check for rotation
  updateButton();    // Check for button events
  delay(5);          // Small delay to prevent busy-waiting
}
```

## Testing

1. Flash the firmware to the ESP32-S3
2. Open the Strong Vibes Playapp in Chrome/Edge
3. Go to Play > Devices > ESP32 Knob Display
4. Click "Connect Knob" — the browser BLE picker should show "Strong Vibes Knob"
5. Rotate the encoder — the app's intensity/speed slider should respond
6. Press the button — the app should toggle play/stop
7. The display should show the current pattern name and MIC level

## Notes

- NimBLE is preferred over the default ESP32 BLE library (smaller footprint, faster)
- Use hardware debouncing (100nF cap across button) or software debouncing (20ms)
- The encoder PCNT approach is more reliable than interrupt-based at high speeds
- Display updates should be throttled to avoid blocking BLE operations
- The display JSON is limited to 128 bytes — keep pattern names short
