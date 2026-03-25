import { Component, ElementRef, ViewChild, inject, AfterViewInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonBadge,
  IonButton,
  IonCard,
  IonCardContent
} from '@ionic/angular/standalone';
import { PrinterService } from '../services/printer';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    NgIf,
    NgFor,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonBadge,
    IonButton,
    IonCard,
    IonCardContent
  ],
  template: `
    <ion-header>
      <ion-toolbar color="dark">
        <ion-title>M110 Label Printer</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card color="dark">
        <ion-card-content>
          <div class="status-container">
            <ion-badge [color]="isConnected ? 'success' : 'warning'">
              {{ isConnected ? 'Printer Verbonden' : 'Niet verbonden' }}
            </ion-badge>
            <p class="connected-name" *ngIf="connectedPrinterName">
              Verbonden met: {{ connectedPrinterName }}
            </p>
          </div>

          <!-- Tabs -->
          <div class="tabs">
            <button class="tab-btn" [class.active]="activeTab === 'adres'" (click)="switchTab('adres')">Adres Label</button>
            <button class="tab-btn" [class.active]="activeTab === 'test'" (click)="switchTab('test')">Test</button>
          </div>

          <!-- Canvas preview -->
          <div class="canvas-wrapper">
            <canvas #printCanvas width="640" height="320"></canvas>
          </div>
          <p class="canvas-hint" *ngIf="activeTab === 'adres'">Voorbeeld (liggend geprint, 80×40mm)</p>

          <!-- Adres formulier -->
          <div *ngIf="activeTab === 'adres'" class="adres-form">
            <label class="field-label">Naam ontvanger</label>
            <input class="field-input" type="text" placeholder="J. Janssen"
              [value]="naam" (input)="naam = $any($event.target).value; updateCanvas()">

            <label class="field-label">Straat + huisnummer</label>
            <input class="field-input" type="text" placeholder="Hoofdstraat 12"
              [value]="adres" (input)="adres = $any($event.target).value; updateCanvas()">

            <label class="field-label">Postcode + Stad</label>
            <input class="field-input" type="text" placeholder="1234 AB Amsterdam"
              [value]="postcodeStat" (input)="postcodeStat = $any($event.target).value; updateCanvas()">

            <label class="field-label">Afzender (optioneel)</label>
            <input class="field-input" type="text" placeholder="Mijn Naam"
              [value]="afzender" (input)="afzender = $any($event.target).value; updateCanvas()">

            <ion-button expand="block" (click)="connect()" fill="outline" class="ion-margin-top">
              Koppel Printer
            </ion-button>
            <ion-button expand="block" (click)="printAdres()" [disabled]="!isConnected" color="primary" class="ion-margin-top">
              Print Adres Label
            </ion-button>
            <ion-button expand="block" (click)="forgetPrinter()" fill="clear" color="medium" class="ion-margin-top">
              Vergeet printerkeuze (alleen app)
            </ion-button>
          </div>

          <!-- Test knoppen -->
          <div *ngIf="activeTab === 'test'">
            <ion-button expand="block" (click)="connect()" fill="outline" class="ion-margin-top">Koppel Printer</ion-button>
            <ion-button expand="block" (click)="connectAlt()" fill="outline" color="medium" class="ion-margin-top">Koppel (alternatief ae30)</ion-button>
            <ion-button expand="block" (click)="scanDevices()" [disabled]="isScanning" fill="outline" class="ion-margin-top">{{ isScanning ? 'Scannen...' : 'Scan BLE Apparaten' }}</ion-button>
            <ion-button expand="block" (click)="feedTest()" [disabled]="!isConnected" fill="outline" color="warning" class="ion-margin-top">Feed Test</ion-button>
            <ion-button expand="block" (click)="wake()" [disabled]="!isConnected" fill="outline" color="warning" class="ion-margin-top">Wake Test</ion-button>
            <ion-button expand="block" (click)="debugChar()" [disabled]="!isConnected" fill="outline" color="medium" class="ion-margin-top">Debug Characteristic</ion-button>
            <ion-button expand="block" (click)="stripePrint()" [disabled]="!isConnected" fill="outline" color="tertiary" class="ion-margin-top">Streep Test</ion-button>
            <ion-button expand="block" (click)="textPrint()" [disabled]="!isConnected" fill="outline" color="light" class="ion-margin-top">Tekst Test</ion-button>
            <ion-button expand="block" (click)="print()" [disabled]="!isConnected" color="secondary" class="ion-margin-top">Print Test Label</ion-button>
          </div>

          <!-- Status berichten -->
          <div class="scan-results" *ngIf="scanResults.length > 0 || lastError">
            <p *ngIf="lastError" class="error-text">{{ lastError }}</p>
            <p *ngIf="scanResults.length > 0"><strong>Gevonden apparaten:</strong></p>
            <p *ngFor="let item of scanResults">{{ item }}</p>
          </div>
        </ion-card-content>
      </ion-card>
    </ion-content>
  `,
  styles: [`
    :host {
      --ion-background-color: #121212;
    }
    .status-container {
      text-align: center;
      margin-bottom: 15px;
    }
    .connected-name {
      color: #9ccc65;
      font-size: 13px;
      margin: 8px 0 0;
    }
    .canvas-wrapper {
      background: #333;
      padding: 10px;
      display: flex;
      justify-content: center;
      border-radius: 8px;
    }
    canvas {
      background: white; /* Papier kleur */
      max-width: 100%;
      height: auto;
      border: 1px solid #444;
    }
    .scan-results {
      margin-top: 12px;
      font-size: 14px;
      color: #111;
      background: #fff;
      padding: 8px;
      border-radius: 6px;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .error-text {
      color: #c62828;
    }
    .tabs {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }
    .tab-btn {
      flex: 1;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #555;
      background: #222;
      color: #aaa;
      font-size: 15px;
      cursor: pointer;
    }
    .tab-btn.active {
      background: #3880ff;
      color: white;
      border-color: #3880ff;
    }
    .canvas-hint {
      text-align: center;
      color: #888;
      font-size: 12px;
      margin: 4px 0 8px;
    }
    .adres-form {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .field-label {
      color: #aaa;
      font-size: 13px;
      margin-top: 10px;
    }
    .field-input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #555;
      background: #1e1e1e;
      color: white;
      font-size: 16px;
      box-sizing: border-box;
    }
    .field-input::placeholder { color: #555; }
  `]
})
export class HomePage implements AfterViewInit {
  private printerService = inject(PrinterService);

  @ViewChild('printCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  isConnected = false;
  isScanning = false;
  scanResults: string[] = [];
  lastError = '';
  connectedPrinterName = '';
  activeTab: 'adres' | 'test' = 'adres';

  // Adres velden
  naam = '';
  adres = '';
  postcodeStat = '';
  afzender = '';

  async ngAfterViewInit() {
    this.drawAddressLabel();
    this.isConnected = await this.printerService.autoReconnectSaved();
    this.connectedPrinterName = this.printerService.getConnectedDeviceName() || '';
    if (this.isConnected) {
      this.scanResults = ['Automatisch verbonden met opgeslagen Phomemo printer.'];
    }
  }

  switchTab(tab: 'adres' | 'test') {
    this.activeTab = tab;
    setTimeout(() => {
      if (tab === 'test') this.drawTestLabel();
      else this.drawAddressLabel();
    }, 50);
  }

  updateCanvas() {
    this.drawAddressLabel();
  }

  drawAddressLabel() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width;  // 640
    const H = canvas.height; // 320

    // Achtergrond
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, W, H);

    // Kader
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    const lm = 22; // linker marge

    // 'AAN:' koptekst
    ctx.fillStyle = '#000';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('AAN:', lm, 46);

    // Naam — groot en vet
    ctx.font = 'bold 44px Arial';
    ctx.fillText(this.naam || '\u2014', lm, 110);

    // Straat
    ctx.font = 'bold 30px Arial';
    ctx.fillText(this.adres || '\u2014', lm, 172);

    // Postcode + Stad
    ctx.fillText(this.postcodeStat || '\u2014', lm, 226);

    // Afzender
    if (this.afzender) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lm, 250);
      ctx.lineTo(W - lm, 250);
      ctx.stroke();
      ctx.font = '20px Arial';
      ctx.fillText('Van: ' + this.afzender, lm, 282);
    }
  }

  async printAdres() {
    this.lastError = '';
    const canvas = this.canvasRef.nativeElement;
    try {
      await this.printerService.print(canvas);
    } catch (e) {
      this.lastError = `Printen mislukt: ${String(e)}`;
    }
  }

  drawTestLabel() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

    // Canvas is 640×320 (liggend). Na 90° rotatie in de printer:
    // breedte = 320px = 40 bytes/rij (maximale M110 printbreedte)
    // hoogte  = 640px → 80mm papierlengte
    // Teken in 480×320 ontwerpruimte, schaal naar het canvas:
    const W = 480; // design-breedte (mapt op canvas.width)
    const H = 320; // design-hoogte  (mapt op canvas.height, = printbreedte = 320 dots = 40mm)
    ctx.save();
    ctx.scale(canvas.width / W, canvas.height / H);

    // 1. Achtergrond
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, W, H);

    // 2. Kader + titel
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('PHOMEMO PARTY', W / 2, 52);

    // 3. Sterretjes links/rechts
    const drawStar = (x: number, y: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a1 = (-90 + i * 72) * Math.PI / 180;
        const a2 = (-54 + i * 72) * Math.PI / 180;
        const x1 = x + Math.cos(a1) * r;
        const y1 = y + Math.sin(a1) * r;
        const x2 = x + Math.cos(a2) * (r * 0.45);
        const y2 = y + Math.sin(a2) * (r * 0.45);
        if (i === 0) ctx.moveTo(x1, y1); else ctx.lineTo(x1, y1);
        ctx.lineTo(x2, y2);
      }
      ctx.closePath();
      ctx.fill();
    };
    drawStar(62, 56, 16);
    drawStar(W - 62, 56, 16);

    // 4. Simpel cartoon-katje (dikke lijnen voor thermisch printen)
    const cx = W / 2;
    const cy = 178;

    // Oren
    ctx.beginPath();
    ctx.moveTo(cx - 78, cy - 48);
    ctx.lineTo(cx - 48, cy - 100);
    ctx.lineTo(cx - 22, cy - 44);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx + 78, cy - 48);
    ctx.lineTo(cx + 48, cy - 100);
    ctx.lineTo(cx + 22, cy - 44);
    ctx.closePath();
    ctx.fill();

    // Hoofd
    ctx.beginPath();
    ctx.arc(cx, cy, 78, 0, Math.PI * 2);
    ctx.fill();

    // Gezicht wit uitsparen
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 60, 0, Math.PI * 2);
    ctx.fill();

    // Ogen
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(cx - 24, cy - 6, 8, 0, Math.PI * 2);
    ctx.arc(cx + 24, cy - 6, 8, 0, Math.PI * 2);
    ctx.fill();

    // Neus + mond
    ctx.beginPath();
    ctx.moveTo(cx, cy + 8);
    ctx.lineTo(cx - 7, cy + 18);
    ctx.lineTo(cx + 7, cy + 18);
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 18);
    ctx.lineTo(cx - 14, cy + 30);
    ctx.moveTo(cx, cy + 18);
    ctx.lineTo(cx + 14, cy + 30);
    ctx.stroke();

    // Snorharen
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 20, cy + 16);
    ctx.lineTo(cx - 62, cy + 8);
    ctx.moveTo(cx - 20, cy + 22);
    ctx.lineTo(cx - 62, cy + 24);
    ctx.moveTo(cx + 20, cy + 16);
    ctx.lineTo(cx + 62, cy + 8);
    ctx.moveTo(cx + 20, cy + 22);
    ctx.lineTo(cx + 62, cy + 24);
    ctx.stroke();

    // 5. Ondertekst
    ctx.textAlign = 'center';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('Doorbraak bereikt!', W / 2, H - 24);

    ctx.restore();
  }

  async connect() {
    this.lastError = '';
    this.scanResults = [];
    this.isConnected = await this.printerService.connect();
    this.connectedPrinterName = this.printerService.getConnectedDeviceName() || '';
    if (!this.isConnected) {
      this.lastError = 'Verbinden mislukt. Probeer eerst Scan BLE Apparaten.';
    } else {
      // Toon welke services/characteristics gevonden zijn (handig bij debuggen).
      const info = this.printerService.discoveredInfo;
      if (info) {
        this.scanResults = ['--- Gevonden BLE services ---', ...info.split('\n')];
      }
    }
  }

  forgetPrinter() {
    this.printerService.forgetSavedPrinter();
    this.isConnected = false;
    this.connectedPrinterName = '';
    this.scanResults = [];
    this.lastError = 'Opgeslagen printer gewist. Koppel opnieuw om een printer te kiezen.';
  }

  async scanDevices() {
    this.isScanning = true;
    this.lastError = '';
    this.scanResults = [];
    try {
      const devices = await this.printerService.scanNearby(6000);
      this.scanResults = devices.map((d) => `${d.name || 'Onbekend'} (${d.deviceId})`);
      if (this.scanResults.length === 0) {
        this.lastError = 'Geen BLE apparaten gevonden. Controleer Bluetooth + Locatie en zet de printer dicht bij je telefoon.';
      }
    } catch (e) {
      this.lastError = `Scan mislukt: ${String(e)}`;
    } finally {
      this.isScanning = false;
    }
  }

  async connectAlt() {
    this.lastError = '';
    this.isConnected = await this.printerService.connectWithAlternative();
    if (!this.isConnected) {
      this.lastError = 'Alternatief profiel mislukt.';
    }
  }

  async wake() {
    this.lastError = '';
    try {
      await this.printerService.wakePrinter();
    } catch (e) {
      this.lastError = `Wake mislukt: ${String(e)}`;
    }
  }

  async debugChar() {
    this.lastError = '';
    try {
      await this.printerService.debugCharacteristic();
    } catch (e) {
      this.lastError = `Debug mislukt: ${String(e)}`;
    }
  }

  async feedTest() {
    this.lastError = '';
    try {
      await this.printerService.feedTest();
    } catch (e) {
      this.lastError = `Feed test mislukt: ${String(e)}`;
    }
  }

  async stripePrint() {
    this.lastError = '';
    try {
      await this.printerService.stripePrint();
    } catch (e) {
      this.lastError = `Streep test mislukt: ${String(e)}`;
    }
  }

  async textPrint() {
    this.lastError = '';
    try {
      await this.printerService.simpleTextPrint();
    } catch (e) {
      this.lastError = `Tekst test mislukt: ${String(e)}`;
    }
  }

  async print() {
    this.lastError = '';
    const canvas = this.canvasRef.nativeElement;
    try {
      await this.printerService.print(canvas);
    } catch (e) {
      console.error('Printen mislukt', e);
      this.lastError = `Printen mislukt: ${String(e)}`;
    }
  }
}
