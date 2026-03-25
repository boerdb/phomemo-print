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
        <ion-title>M110 Proef App</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-card color="dark">
        <ion-card-content>
          <div class="status-container">
            <ion-badge [color]="isConnected ? 'success' : 'warning'">
              {{ isConnected ? 'Printer Verbonden' : 'Niet verbonden' }}
            </ion-badge>
          </div>

          <div class="canvas-wrapper">
            <canvas #printCanvas width="480" height="320"></canvas>
          </div>

          <ion-button expand="block" (click)="connect()" fill="outline" class="ion-margin-top">
            Koppel Printer
          </ion-button>

          <ion-button expand="block" (click)="connectAlt()" fill="outline" color="medium" class="ion-margin-top">
            Koppel (alternatief profiel ae30)
          </ion-button>

          <ion-button expand="block" (click)="scanDevices()" [disabled]="isScanning" fill="outline" class="ion-margin-top">
            {{ isScanning ? 'Scannen...' : 'Scan BLE Apparaten' }}
          </ion-button>

          <ion-button expand="block" (click)="feedTest()" [disabled]="!isConnected" fill="outline" color="warning" class="ion-margin-top">
            Feed Test (papier invoer)
          </ion-button>

          <ion-button expand="block" (click)="wake()" [disabled]="!isConnected" fill="outline" color="warning" class="ion-margin-top">
            Wake Test (printer activeren)
          </ion-button>

          <ion-button expand="block" (click)="debugChar()" [disabled]="!isConnected" fill="outline" color="medium" class="ion-margin-top">
            Debug Characteristic
          </ion-button>

          <ion-button expand="block" (click)="stripePrint()" [disabled]="!isConnected" fill="outline" color="tertiary" class="ion-margin-top">
            Streep Test (kleine zwarte balk)
          </ion-button>

          <ion-button expand="block" (click)="textPrint()" [disabled]="!isConnected" fill="outline" color="light" class="ion-margin-top">
            Tekst Test (Hello M110!)
          </ion-button>

          <ion-button expand="block" (click)="print()" [disabled]="!isConnected" color="secondary">
            Print Test Label
          </ion-button>

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
  `]
})
export class HomePage implements AfterViewInit {
  private printerService = inject(PrinterService);

  @ViewChild('printCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  isConnected = false;
  isScanning = false;
  scanResults: string[] = [];
  lastError = '';

  ngAfterViewInit() {
    // Teken het eerste label zodra het scherm geladen is
    this.drawTestLabel();
  }

  drawTestLabel() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d')!;

    // Canvas is 480×320 (liggend). Na 90° rotatie in de printer:
    // breedte = 320px = 40 bytes/rij → past op M110 40mm label.
    // hoogte  = 480px → de papierlengte.

    // 1. Achtergrond
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Kader + titel
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.fillStyle = 'black';
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('PHOMEMO PARTY', canvas.width / 2, 52);

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
    drawStar(canvas.width - 62, 56, 16);

    // 4. Simpel cartoon-katje (dikke lijnen voor thermisch printen)
    const cx = canvas.width / 2;
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
    ctx.fillText('Doorbraak bereikt!', canvas.width / 2, canvas.height - 24);
  }

  async connect() {
    this.lastError = '';
    this.scanResults = [];
    this.isConnected = await this.printerService.connect();
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
