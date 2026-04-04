#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <NewPing.h>
#include <PubSubClient.h>
#include <EEPROM.h>

#define TRIGGER_PIN 5
#define ECHO_PIN 18
#define OLED_SCREEN_WIDTH 128
#define OLED_SCREEN_HEIGHT 64
#define OLED_RESET_PIN -1
#define BUZZER_PIN 4
#define CALIBRATION_BUTTON_PIN 0
#define MAX_DISTANCE 400

struct CalibrationData {
    int minDistance;
    int maxDistance;
    bool isCalibrated;
};

const char* ssid = "prabu96";
const char* password = "rap@1996";
const char* serverURL = "https://water-tank-monitoring.onrender.com/api/v1/data";
const char* mqttServer = "water-tank-monitoring.onrender.com";
const int mqttPort = 1883;
const char* mqttTopic = "watertank/data";

String deviceId = "tank_001";
int lowThreshold = 20;
int highThreshold = 90;

unsigned long lastReadTime = 0;
unsigned long readInterval = 2000;
unsigned long lastSendTime = 0;
unsigned long sendInterval = 10000;
bool useMQTT = false;

Adafruit_SSD1306 display(OLED_SCREEN_WIDTH, OLED_SCREEN_HEIGHT, &Wire, OLED_RESET_PIN);
NewPing sonar(TRIGGER_PIN, ECHO_PIN, MAX_DISTANCE);

WiFiClient wifiClient;
WiFiClientSecure secureClient;
PubSubClient mqttClient(wifiClient);
HTTPClient httpClient;

float currentWaterLevel = 0;
int currentDistance = 0;
String currentStatus = "NORMAL";
bool wifiConnected = false;
bool mqttConnected = false;
CalibrationData calib;
unsigned long lastWiFiRetryTime = 0;
const unsigned long wifiRetryInterval = 10000;

unsigned long currentTimestamp() {
    return millis();
}

void saveCalibration() {
    EEPROM.put(0, calib);
    EEPROM.commit();
    Serial.println("Calibration saved to EEPROM");
}

void loadCalibration() {
    EEPROM.get(0, calib);
    if (!calib.isCalibrated) {
        calib.minDistance = 5;
        calib.maxDistance = 100;
        calib.isCalibrated = true;
    }
    Serial.print("Loaded calibration - Min: ");
    Serial.print(calib.minDistance);
    Serial.print("cm, Max: ");
    Serial.print(calib.maxDistance);
    Serial.println("cm");
}

void connectWiFi() {
    Serial.println("Connecting to WiFi...");
    WiFi.begin(ssid, password);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        wifiConnected = true;
        Serial.println("\nWiFi Connected!");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
    } else {
        wifiConnected = false;
        Serial.println("\nWiFi Connection Failed!");
        WiFi.disconnect(true);
    }
}

void connectMQTT() {
    if (!useMQTT) return;
    Serial.println("Connecting to MQTT...");
    mqttClient.setServer(mqttServer, mqttPort);
    char clientId[50];
    snprintf(clientId, 50, "WaterTank_%s", deviceId.c_str());
    if (mqttClient.connect(clientId)) {
        mqttConnected = true;
        Serial.println("MQTT Connected!");
    } else {
        mqttConnected = false;
        Serial.println("MQTT Connection Failed!");
    }
}

void initBuzzer() {
    pinMode(BUZZER_PIN, OUTPUT);
    digitalWrite(BUZZER_PIN, LOW);
}

void playAlertTone(int frequency, int duration) {
    tone(BUZZER_PIN, frequency, duration);
}

void stopAlertTone() {
    noTone(BUZZER_PIN);
}

void updateStatus(float waterLevel) {
    if (waterLevel < lowThreshold) {
        currentStatus = "LOW";
        playAlertTone(800, 200);
        delay(300);
    } else if (waterLevel > highThreshold) {
        currentStatus = "FULL";
        playAlertTone(1200, 200);
        delay(300);
    } else {
        currentStatus = "NORMAL";
        stopAlertTone();
    }
}

void updateOLED(float waterLevel, int distance, String status) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    
    display.setCursor(0, 0);
    display.println("Water Level Monitor");
    
    display.setTextSize(3);
    display.setCursor(10, 20);
    display.print(waterLevel, 0);
    display.println("%");
    
    display.setTextSize(1);
    display.setCursor(0, 50);
    display.print("Dist: ");
    display.print(distance);
    display.println("cm");
    
    display.setCursor(80, 50);
    if (status == "LOW") {
        display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        display.println("LOW!");
    } else if (status == "FULL") {
        display.setTextColor(SSD1306_BLACK, SSD1306_WHITE);
        display.println("FULL!");
    } else {
        display.setTextColor(SSD1306_WHITE);
        display.println("NORMAL");
    }
    
    display.display();
}

void updateOLEDCalibration(const char* message, int value = -1) {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Calibration");
    display.setTextSize(1);
    display.setCursor(0, 20);
    display.println(message);
    if (value >= 0) {
        display.setTextSize(2);
        display.setCursor(20, 40);
        display.print(value);
        display.println("cm");
    }
    display.display();
}

String createJSON(float waterLevel, int distance, String status) {
    String json = "{";
    json += "\"device_id\":\"" + deviceId + "\",";
    json += "\"water_level\":" + String(waterLevel, 1) + ",";
    json += "\"distance_cm\":" + String(distance) + ",";
    json += "\"status\":\"" + status + "\",";
    json += "\"timestamp\":" + String(currentTimestamp());
    json += "}";
    return json;
}

void sendDataToServer(float waterLevel, int distance, String status) {
    if (!wifiConnected) return;
    
    String json = createJSON(waterLevel, distance, status);
    Serial.println("Sending data: " + json);
    
    secureClient.setInsecure();
    httpClient.begin(secureClient, serverURL);
    httpClient.addHeader("Content-Type", "application/json");
    int httpCode = httpClient.POST(json);
    
    if (httpCode > 0) {
        String response = httpClient.getString();
        Serial.println("HTTP Response: " + String(httpCode));
        Serial.println(response);
    } else {
        Serial.println("HTTP Error: " + String(httpCode));
    }
    
    httpClient.end();
}

void sendDataMQTT(float waterLevel, int distance, String status) {
    if (!useMQTT || !mqttConnected) return;
    
    String json = createJSON(waterLevel, distance, status);
    mqttClient.publish(mqttTopic, json.c_str());
}

void sendData(float waterLevel, int distance, String status) {
    sendDataToServer(waterLevel, distance, status);
    if (useMQTT) {
        sendDataMQTT(waterLevel, distance, status);
    }
}

float calculateWaterLevel(int distanceCm) {
    if (distanceCm <= 0 || distanceCm > MAX_DISTANCE) {
        return -1;
    }
    if (distanceCm <= calib.minDistance) {
        return 100;
    }
    if (distanceCm >= calib.maxDistance) {
        return 0;
    }
    float waterDepth = calib.maxDistance - distanceCm;
    float level = (waterDepth / (calib.maxDistance - calib.minDistance)) * 100;
    if (level > 100) level = 100;
    if (level < 0) level = 0;
    return level;
}

int readDistance() {
    unsigned int uS = sonar.ping_median(5);
    int distance = uS / US_ROUNDTRIP_CM;
    return distance;
}

void runCalibration() {
    Serial.println("Starting calibration...");
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Calibration Mode");
    display.display();
    delay(2000);
    
    updateOLEDCalibration("1. Fill tank", -1);
    delay(3000);
    
    int fullDistance = readDistance();
    Serial.print("Full tank distance: ");
    Serial.println(fullDistance);
    updateOLEDCalibration("Full: ", fullDistance);
    delay(2000);
    
    updateOLEDCalibration("2. Empty tank", -1);
    delay(5000);
    
    int emptyDistance = readDistance();
    Serial.print("Empty tank distance: ");
    Serial.println(emptyDistance);
    updateOLEDCalibration("Empty: ", emptyDistance);
    delay(2000);
    
    calib.minDistance = fullDistance;
    calib.maxDistance = emptyDistance;
    calib.isCalibrated = true;
    saveCalibration();
    
    Serial.println("Calibration complete!");
    Serial.print("Min: ");
    Serial.print(calib.minDistance);
    Serial.print("cm, Max: ");
    Serial.print(calib.maxDistance);
    Serial.println("cm");
    
    updateOLEDCalibration("Done!", -1);
    delay(2000);
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    EEPROM.begin(512);
    
    loadCalibration();
    
    pinMode(CALIBRATION_BUTTON_PIN, INPUT_PULLUP);
    
    Serial.println("=== Water Tank Monitor ===");
    Serial.println("Initializing...");
    
    if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
        Serial.println("OLED init failed!");
        while (1);
    }
    
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(0, 0);
    display.println("Initializing...");
    display.display();
    
    initBuzzer();
    connectWiFi();
    if (useMQTT) {
        connectMQTT();
    }
    
    Serial.println("System ready!");
    display.clearDisplay();
    display.setCursor(0, 0);
    display.println("System Ready!");
    display.display();
    
    delay(2000);
}

void loop() {
    unsigned long currentTime = millis();

    if (WiFi.status() != WL_CONNECTED) {
        wifiConnected = false;
        if (currentTime - lastWiFiRetryTime >= wifiRetryInterval) {
            lastWiFiRetryTime = currentTime;
            connectWiFi();
        }
    } else {
        wifiConnected = true;
    }
    
    if (digitalRead(CALIBRATION_BUTTON_PIN) == LOW) {
        Serial.println("Calibration button pressed!");
        delay(500);
        runCalibration();
    }
    
    if (currentTime - lastReadTime >= readInterval) {
        lastReadTime = currentTime;
        
        currentDistance = readDistance();
        if (currentDistance > 0 && currentDistance <= MAX_DISTANCE) {
            currentWaterLevel = calculateWaterLevel(currentDistance);
            updateStatus(currentWaterLevel);
            
            Serial.print("Distance: ");
            Serial.print(currentDistance);
            Serial.println(" cm");
            Serial.print("Water Level: ");
            Serial.print(currentWaterLevel, 1);
            Serial.println("%");
            Serial.print("Status: ");
            Serial.println(currentStatus);
            
            updateOLED(currentWaterLevel, currentDistance, currentStatus);
        } else {
            Serial.println("Invalid distance reading");
        }
    }
    
    if (currentTime - lastSendTime >= sendInterval) {
        lastSendTime = currentTime;
        if (wifiConnected && currentWaterLevel >= 0) {
            sendData(currentWaterLevel, currentDistance, currentStatus);
        }
    }
    
    if (useMQTT && mqttConnected) {
        mqttClient.loop();
    }
    
    delay(50);
}
