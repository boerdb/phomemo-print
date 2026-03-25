import { Injectable } from '@angular/core';
import { BleClient, BleDevice } from '@capacitor-community/bluetooth-le';
import { Capacitor } from '@capacitor/core';

const DEFAULT_SERVICE_UUID = '0000ff00-0000-1000-8000-00805f9b34fb';
const DEFAULT_CHAR_UUID    = '0000ff02-0000-1000-8000-00805f9b34fb';
const NOTIFY_CHAR_UUID     = '0000ff03-0000-1000-8000-00805f9b34fb';
const KNOWN_PRINTER_NAME   = 'Q199G4C40030033';
const LAST_DEVICE_ID_KEY   = 'phomemo.lastDeviceId';
const CHUNK_SIZE = 512;  // BLE MTU op Android ondersteunt tot 512 bytes
const CHUNK_DELAY = 20;  // ms tussen chunks (was 100ms debug)

const PROFILE_CANDIDATES = [
  // Phomemo M110 — ff00 service (gevonden via BLE scan)
  {
    service: '0000ff00-0000-1000-8000-00805f9b34fb',
    writeChar: '0000ff02-0000-1000-8000-00805f9b34fb',
    notifyChar: '0000ff03-0000-1000-8000-00805f9b34fb',
  },
  // Alternatief 18f0 profiel (andere Phomemo modellen)
  {
    service: '000018f0-0000-1000-8000-00805f9b34fb',
    writeChar: '00002af1-0000-1000-8000-00805f9b34fb',
    notifyChar: null,
  },
  // ae30 profiel
  {
    service: '0000ae30-0000-1000-8000-00805f9b34fb',
    writeChar: '0000ae01-0000-1000-8000-00805f9b34fb',
    notifyChar: '0000ae02-0000-1000-8000-00805f9b34fb',
  },
] as const;

@Injectable({
  providedIn: 'root'
})
export class PrinterService {
  private deviceId: string | null = null;
  private deviceName: string | null = null;
  private serviceUuid = DEFAULT_SERVICE_UUID;
  private charUuid = DEFAULT_CHAR_UUID;
  private notifyUuid: string | null = NOTIFY_CHAR_UUID;
  private preferWriteWithoutResponse = false;
  discoveredInfo = '';

  getConnectedDeviceName(): string | null {
    return this.deviceName;
  }

  private saveLastDeviceId(deviceId: string): void {
    try {
      localStorage.setItem(LAST_DEVICE_ID_KEY, deviceId);
    } catch {
      // Opslaan mag falen zonder de printflow te blokkeren.
    }
  }

  private getLastDeviceId(): string | null {
    try {
      return localStorage.getItem(LAST_DEVICE_ID_KEY);
    } catch {
      return null;
    }
  }

  forgetSavedPrinter(): void {
    this.deviceId = null;
    this.deviceName = null;
    try {
      localStorage.removeItem(LAST_DEVICE_ID_KEY);
    } catch {
      // Geen probleem als storage niet beschikbaar is.
    }
  }

  async autoReconnectSaved(): Promise<boolean> {
    const savedDeviceId = this.getLastDeviceId();
    if (!savedDeviceId) {
      return false;
    }

    try {
      await this.ensureBleReady();
      this.deviceId = savedDeviceId;
      await BleClient.disconnect(savedDeviceId).catch(() => undefined);
      await BleClient.connect(savedDeviceId);
      await this.configureConnectedPrinter(savedDeviceId);
      return true;
    } catch (error) {
      console.warn('Auto-reconnect mislukt:', error);
      this.deviceId = null;
      return false;
    }
  }

  private async configureConnectedPrinter(deviceId: string): Promise<void> {
    // discoverServices is verplicht op Android vóór elke read/write.
    await BleClient.discoverServices(deviceId);
    const services = await BleClient.getServices(deviceId);

    // Dump alle gevonden UUIDs + properties naar de UI voor debugging.
    this.discoveredInfo = '';
    for (const svc of services) {
      this.discoveredInfo += `Service: ${svc.uuid}\n`;
      for (const ch of svc.characteristics) {
        this.discoveredInfo += `  Char: ${ch.uuid}\n`;
        this.discoveredInfo += `    Props: ${JSON.stringify(ch.properties)}\n`;
        if (ch.properties.read) {
          try {
            const val = await BleClient.read(deviceId, svc.uuid, ch.uuid);
            this.discoveredInfo += `    Read: ${Array.from(new Uint8Array(val.buffer)).map(b => b.toString(16).padStart(2,'0')).join(' ')}\n`;
          } catch (e) {
            this.discoveredInfo += `    Read failed: ${e}\n`;
          }
        }
      }
    }
    console.log('Gevonden BLE services:\n' + this.discoveredInfo);

    // Stap 1: zoek een bekend Phomemo profiel.
    let found = false;
    for (const profile of PROFILE_CANDIDATES) {
      const svc = services.find(s => s.uuid.toLowerCase() === profile.service);
      if (!svc) continue;
      const wch = svc.characteristics.find(c => c.uuid.toLowerCase() === profile.writeChar
        && (c.properties.write || c.properties.writeWithoutResponse));
      if (!wch) continue;
      this.serviceUuid = svc.uuid;
      this.charUuid = wch.uuid;
      this.preferWriteWithoutResponse = !!wch.properties.writeWithoutResponse;
      this.notifyUuid = profile.notifyChar ?? null;
      found = true;
      break;
    }

    // Stap 2: geen bekend profiel → neem de eerste schrijfbare characteristic.
    if (!found) {
      outer2: for (const svc of services) {
        for (const ch of svc.characteristics) {
          if (ch.properties.write || ch.properties.writeWithoutResponse) {
            this.serviceUuid = svc.uuid;
            this.charUuid = ch.uuid;
            this.preferWriteWithoutResponse = !!ch.properties.writeWithoutResponse && !ch.properties.write;
            this.notifyUuid = null;
            found = true;
            break outer2;
          }
        }
      }
    }

    if (!found) {
      throw new Error('Geen schrijfbare BLE characteristic gevonden. Zie "Gevonden services" in de app.');
    }

    console.log('Schrijfbare target:', this.serviceUuid, this.charUuid, 'WnR:', this.preferWriteWithoutResponse, 'Notify:', this.notifyUuid);

    // Subscribe op de notify-characteristic voor printer-status (bijv. ff03).
    if (this.notifyUuid) {
      try {
        await BleClient.startNotifications(
          deviceId,
          this.serviceUuid,
          this.notifyUuid,
          (value) => {
            const bytes = Array.from(new Uint8Array(value.buffer)).map(b => b.toString(16).padStart(2,'0')).join(' ');
            console.log('Printer status notificatie:', bytes);
          }
        );
        console.log('Notificaties ingeschakeld op', this.notifyUuid);
      } catch (e) {
        console.log('Notificaties niet ondersteund:', e);
      }
    }
  }

  private async ensureBleReady(): Promise<void> {
    await BleClient.initialize();

    if (Capacitor.getPlatform() === 'android') {
      const locationEnabled = await BleClient.isLocationEnabled();
      if (!locationEnabled) {
        console.warn('Locatie-services uitgeschakeld, instellingen openen...');
        await BleClient.openLocationSettings();
        // Wacht tot gebruiker terugkeert vanuit instellingen
        await new Promise(resolve => setTimeout(resolve, 2000));
        const stillDisabled = await BleClient.isLocationEnabled();
        if (stillDisabled) {
          throw new Error('Locatie-services zijn vereist voor Bluetooth. Zet ze handmatig aan.');
        }
      }
    }
  }

  async scanNearby(scanMs = 5000): Promise<BleDevice[]> {
    await this.ensureBleReady();

    const devices = new Map<string, BleDevice>();

    await BleClient.requestLEScan({}, (result) => {
      const device = result.device;
      if (device?.deviceId) {
        devices.set(device.deviceId, device);
      }
    });

    await new Promise((resolve) => setTimeout(resolve, scanMs));
    await BleClient.stopLEScan();

    return Array.from(devices.values());
  }

  private isLikelyPhomemo(device: BleDevice): boolean {
    const name = (device.name || '').toLowerCase();
    return name === KNOWN_PRINTER_NAME.toLowerCase() || name.includes('phomemo') || name.includes('m110');
  }

  private async connectByDeviceId(deviceId: string): Promise<void> {
    this.deviceId = deviceId;
    await BleClient.disconnect(deviceId).catch(() => undefined);
    await BleClient.connect(deviceId);
    const devices = await BleClient.getDevices([deviceId]).catch(() => [] as BleDevice[]);
    this.deviceName = devices[0]?.name || this.deviceName || deviceId;
    await this.configureConnectedPrinter(deviceId);
    this.saveLastDeviceId(deviceId);
  }

  private async tryConnectFromBondedDevices(): Promise<boolean> {
    if (Capacitor.getPlatform() !== 'android') {
      return false;
    }

    let bonded: BleDevice[] = [];
    try {
      bonded = await BleClient.getBondedDevices();
    } catch (e) {
      console.log('Bonded devices niet beschikbaar:', e);
      return false;
    }

    if (bonded.length === 0) {
      return false;
    }

    const preferred = bonded.find((d) => this.isLikelyPhomemo(d)) ?? bonded[0];
    if (!preferred?.deviceId) {
      return false;
    }

    try {
      await this.connectByDeviceId(preferred.deviceId);
      console.log('Verbonden via Android gekoppeld apparaat:', preferred.name || preferred.deviceId);
      return true;
    } catch (e) {
      console.warn('Verbinden via gekoppeld apparaat mislukt:', e);
      return false;
    }
  }

  /**
   * Verbindt met de Phomemo M110 via één device picker.
   */
  async connect(): Promise<boolean> {
    try {
      await this.ensureBleReady();

      // Eerst proberen via al gekoppelde Android BLE apparaten.
      // Dit helpt wanneer requestDevice() niets toont terwijl de printer al "gekoppeld" staat.
      if (await this.tryConnectFromBondedDevices()) {
        return true;
      }

      const device = await BleClient.requestDevice({
        optionalServices: PROFILE_CANDIDATES.map(p => p.service) as string[],
      });
      this.deviceName = device.name || device.deviceId;
      await this.connectByDeviceId(device.deviceId);

      return true;
    } catch (error) {
      console.warn('Bluetooth verbinding mislukt:', error);
      this.deviceId = null;
      this.deviceName = null;
      return false;
    }
  }

  /**
   * Bitmap streep test met volledige init-sequentie.
   * Data wordt in één keer verstuurd (geen chunks) voor maximale betrouwbaarheid.
   */
  async stripePrint(): Promise<void> {
    if (!this.deviceId) throw new Error('Printer niet verbonden.');

    const bytesPerRow = 40;  // 320 dots / 8 = 40 bytes
    const rows = 50;

    const data: number[] = [
      0x1b, 0x40,            // ESC @ reset
      0x1b, 0x33, 0x18,      // ESC 3 – regelafstand 24 dots
      0x1b, 0x61, 0x01,      // ESC a – centreer
      0x1d, 0x76, 0x30, 0x00, // GS v 0 – raster bitmap
      bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff, // xL, xH
      rows & 0xff, (rows >> 8) & 0xff,               // yL, yH
    ];

    for (let i = 0; i < bytesPerRow * rows; i++) data.push(0xff); // alles zwart
    // Geen extra feed/cut: op M110 kan dit tot ongewenst doorvoeren leiden.

    const buf = new Uint8Array(data);
    console.log(`Stripe: ${buf.length} bytes in chunks van ${CHUNK_SIZE}`);
    for (let i = 0; i < buf.length; i += CHUNK_SIZE) {
      const chunk = buf.slice(i, i + CHUNK_SIZE);
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const nr = Math.floor(i / CHUNK_SIZE) + 1;
      const total = Math.ceil(buf.length / CHUNK_SIZE);
      console.log(`Stripe chunk ${nr}/${total}`);
      await BleClient.write(this.deviceId, this.serviceUuid, this.charUuid, view);
      await new Promise(r => setTimeout(r, CHUNK_DELAY));
    }
    console.log('Stripe klaar');
  }

  /**
   * Tekst test met echte ESC/POS tekst-commando's (geen bitmap).
   */
  async simpleTextPrint(): Promise<void> {
    if (!this.deviceId) throw new Error('Printer niet verbonden.');
    const data = new Uint8Array([
      0x1b, 0x40,              // Reset
      0x1b, 0x21, 0x08,        // ESC ! – dubbele hoogte
      0x48, 0x65, 0x6c, 0x6c, 0x6f, 0x0a, // "Hello\n"
      0x1b, 0x21, 0x00,        // Normaal
      0x50, 0x68, 0x6f, 0x6d, 0x65, 0x6d, 0x6f, 0x20,
      0x4d, 0x31, 0x31, 0x30, 0x0a,        // "Phomemo M110\n"
    ]);
    console.log('Tekst test bytes:', data.length);
    await BleClient.write(this.deviceId, this.serviceUuid, this.charUuid, new DataView(data.buffer));
    console.log('Tekst verstuurd');
  }

  /**
   * Wake-up: stuur 5× LF dan reset om de printer te activeren.
   */
  async wakePrinter(): Promise<void> {
    if (!this.deviceId) throw new Error('Printer niet verbonden.');
    for (let i = 0; i < 5; i++) {
      await BleClient.write(this.deviceId, this.serviceUuid, this.charUuid,
        new DataView(new Uint8Array([0x0a]).buffer));
      await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 500));
    await BleClient.write(this.deviceId, this.serviceUuid, this.charUuid,
      new DataView(new Uint8Array([0x1b, 0x40]).buffer));
    console.log('Printer gewekt');
  }

  /**
   * Debug: log welke service+characteristic momenteel geselecteerd is.
   * Stuurt ook alleen ESC @ om te kijken of het motortje reageert.
   */
  async debugCharacteristic(): Promise<void> {
    if (!this.deviceId) throw new Error('Printer niet verbonden.');
    console.log('Service UUID :', this.serviceUuid);
    console.log('Char UUID    :', this.charUuid);
    console.log('WnR voorkeur :', this.preferWriteWithoutResponse);
    await BleClient.write(this.deviceId, this.serviceUuid, this.charUuid,
      new DataView(new Uint8Array([0x1b, 0x40]).buffer));
    console.log('Reset commando verstuurd');
  }

  /**
   * Verbindt met het alternatieve ae30/ae01 profiel en probeert meteen een tekst print.
   */
  async connectWithAlternative(): Promise<boolean> {
    try {
      await this.ensureBleReady();
      const device = await BleClient.requestDevice({ optionalServices: [
        '0000ae30-0000-1000-8000-00805f9b34fb',
        DEFAULT_SERVICE_UUID,
      ]});
      this.deviceId = device.deviceId;
      await BleClient.disconnect(this.deviceId).catch(() => undefined);
      await BleClient.connect(this.deviceId);
      await BleClient.discoverServices(this.deviceId);

      this.serviceUuid = '0000ae30-0000-1000-8000-00805f9b34fb';
      this.charUuid    = '0000ae01-0000-1000-8000-00805f9b34fb';
      this.notifyUuid  = '0000ae02-0000-1000-8000-00805f9b34fb';
      this.preferWriteWithoutResponse = false;
      console.log('Geforceerd alternatief profiel ae30/ae01');

      this.saveLastDeviceId(this.deviceId);

      await this.simpleTextPrint();
      return true;
    } catch (e) {
      console.error('Alternatief profiel mislukt:', e);
      return false;
    }
  }

  /**
   * Minimale test: stuur alleen reset + 1 raw line feed.
   * Houd dit bewust klein om doorlopend labeltransport te voorkomen.
   */
  async feedTest(): Promise<void> {
    if (!this.deviceId) {
      throw new Error('Printer niet verbonden.');
    }
    // ESC @ = reset, daarna 1× LF (0x0A) = minimale papier invoer
    const lf = [0x0a];
    const data = new Uint8Array([0x1b, 0x40, ...lf]);
    const view = new DataView(data.buffer);
    await BleClient.writeWithoutResponse(this.deviceId, this.serviceUuid, this.charUuid, view);
  }

  /**
   * Verwerkt het canvas en stuurt de data naar de printer.
   */
  async print(canvas: HTMLCanvasElement) {
    if (!this.deviceId) {
      throw new Error('Printer niet verbonden. Roep eerst connect() aan.');
    }

    const data = this.processCanvas(canvas);
    console.log(`Print: ${data.length} bytes in chunks van ${CHUNK_SIZE}`);

    for (let i = 0; i < data.length; i += CHUNK_SIZE) {
      const chunk = data.slice(i, i + CHUNK_SIZE);
      const view = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      await this.writeChunk(this.deviceId, view);
      await new Promise(resolve => setTimeout(resolve, CHUNK_DELAY));
    }
  }

  private async writeChunk(deviceId: string, view: DataView): Promise<void> {
    // write() wacht op bevestiging → betrouwbaarder voor thermische printers.
    await BleClient.write(deviceId, this.serviceUuid, this.charUuid, view);
  }

  /**
   * Converteert canvas naar 1-bit zwart-wit data en draait het 90 graden.
   * De M110 print horizontaal, dus we draaien het ontwerp voor de gebruiker.
   */
  private processCanvas(canvas: HTMLCanvasElement): Uint8Array {
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const srcWidth = canvas.width;
    const srcHeight = canvas.height;
    const imageData = ctx.getImageData(0, 0, srcWidth, srcHeight).data;

    // Na 90 graden rotatie wisselen breedte en hoogte
    const newWidth = srcHeight;
    const newHeight = srcWidth;
    const bytesPerRow = Math.ceil(newWidth / 8);

    const printData: number[] = [];

    // 1. Initialisatie commando's (ESC/POS / GS v 0)
    printData.push(0x1b, 0x40); // Reset
    printData.push(0x1d, 0x76, 0x30, 0x00); // Start Bitmap
    printData.push(bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff); // Breedte
    printData.push(newHeight & 0xff, (newHeight >> 8) & 0xff); // Hoogte

    // 2. Pixels omzetten en roteren
    for (let y = 0; y < newHeight; y++) {
      for (let x = 0; x < bytesPerRow; x++) {
        let byte = 0;
        for (let bit = 0; bit < 8; bit++) {
          const newX = x * 8 + bit;
          if (newX < newWidth) {
            // Rotatie mapping: we lezen het canvas van onder naar boven, links naar rechts
            const srcX = y;
            const srcY = (newWidth - 1) - newX;

            const idx = (srcY * srcWidth + srcX) * 4;
            // Helderheid berekenen (Luminance)
            const r = imageData[idx];
            const g = imageData[idx + 1];
            const b = imageData[idx + 2];
            const brightness = (r + g + b) / 3;

            // Als pixel donker is -> maak zwart (bit op 1)
            if (brightness < 128) {
              byte |= (0x80 >> bit);
            }
          }
        }
        printData.push(byte);
      }
    }

    // 3. Geen automatische feed op het einde; M110 doet label advance zelf.

    return new Uint8Array(printData);
  }
}
