/**
 * CRX Downloader - Downloads and extracts Chrome extensions from the Web Store
 */

import { app, net } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import AdmZip from 'adm-zip';

// Chrome version to report (affects which extension version we get)
const CHROME_VERSION = '120.0.0.0';

// CRX download URL template
const CRX_URL_TEMPLATE =
  'https://clients2.google.com/service/update2/crx?response=redirect&prodversion={VERSION}&acceptformat=crx2,crx3&x=id%3D{ID}%26uc';

/**
 * Extract extension ID from various URL formats
 */
export function extractExtensionId(input: string): string | null {
  // If it's already just an ID (32 lowercase letters)
  if (/^[a-z]{32}$/.test(input)) {
    return input;
  }

  // Try to extract from Chrome Web Store URL
  // Format: https://chromewebstore.google.com/detail/extension-name/extensionid
  // or: https://chrome.google.com/webstore/detail/extension-name/extensionid
  const patterns = [
    /chromewebstore\.google\.com\/detail\/[^\/]+\/([a-z]{32})/i,
    /chrome\.google\.com\/webstore\/detail\/[^\/]+\/([a-z]{32})/i,
    /\/([a-z]{32})(?:\?|$|\/)/i,
  ];

  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
  }

  return null;
}

/**
 * Download CRX file from Chrome Web Store
 */
async function downloadCrx(extensionId: string): Promise<Buffer> {
  const url = CRX_URL_TEMPLATE
    .replace('{VERSION}', CHROME_VERSION)
    .replace('{ID}', extensionId);

  return new Promise((resolve, reject) => {
    const request = net.request(url);
    const chunks: Buffer[] = [];

    request.on('response', (response) => {
      if (response.statusCode === 204) {
        reject(new Error('Extension not found or not available'));
        return;
      }

      if (response.statusCode !== 200) {
        // Handle redirects
        const location = response.headers['location'];
        if (location && (response.statusCode === 301 || response.statusCode === 302)) {
          // Follow redirect
          const redirectUrl = Array.isArray(location) ? location[0] : location;
          if (!redirectUrl) {
            reject(new Error('Invalid redirect URL'));
            return;
          }
          const redirectRequest = net.request(redirectUrl);
          const redirectChunks: Buffer[] = [];

          redirectRequest.on('response', (redirectResponse) => {
            if (redirectResponse.statusCode !== 200) {
              reject(new Error(`Failed to download extension: HTTP ${redirectResponse.statusCode}`));
              return;
            }

            redirectResponse.on('data', (chunk) => {
              redirectChunks.push(chunk);
            });

            redirectResponse.on('end', () => {
              resolve(Buffer.concat(redirectChunks));
            });

            redirectResponse.on('error', reject);
          });

          redirectRequest.on('error', reject);
          redirectRequest.end();
          return;
        }

        reject(new Error(`Failed to download extension: HTTP ${response.statusCode}`));
        return;
      }

      response.on('data', (chunk) => {
        chunks.push(chunk);
      });

      response.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      response.on('error', reject);
    });

    request.on('error', reject);
    request.end();
  });
}

/**
 * Extract ZIP content from CRX buffer
 * CRX3 format:
 * - 4 bytes: "Cr24" magic number
 * - 4 bytes: version (3)
 * - 4 bytes: header length
 * - header (protobuf)
 * - ZIP archive
 */
function extractZipFromCrx(crxBuffer: Buffer): Buffer {
  // Check magic number
  const magic = crxBuffer.slice(0, 4).toString('utf8');
  if (magic !== 'Cr24') {
    throw new Error('Invalid CRX file: bad magic number');
  }

  // Get version
  const version = crxBuffer.readUInt32LE(4);

  if (version === 3) {
    // CRX3 format
    const headerLength = crxBuffer.readUInt32LE(8);
    const zipStart = 12 + headerLength;
    return crxBuffer.slice(zipStart);
  } else if (version === 2) {
    // CRX2 format (legacy)
    const pubKeyLength = crxBuffer.readUInt32LE(8);
    const sigLength = crxBuffer.readUInt32LE(12);
    const zipStart = 16 + pubKeyLength + sigLength;
    return crxBuffer.slice(zipStart);
  } else {
    throw new Error(`Unsupported CRX version: ${version}`);
  }
}

/**
 * Extract ZIP buffer to directory using AdmZip
 */
async function extractZip(zipBuffer: Buffer, destDir: string): Promise<void> {
  const zip = new AdmZip(zipBuffer);
  zip.extractAllTo(destDir, true);
}

/**
 * Get extension name from manifest
 */
function getExtensionName(extensionDir: string): string {
  try {
    const manifestPath = path.join(extensionDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    return manifest.name || 'Unknown Extension';
  } catch {
    return 'Unknown Extension';
  }
}

/**
 * Download and install extension from Chrome Web Store
 */
export async function installExtensionFromWebStore(
  extensionIdOrUrl: string
): Promise<{ success: boolean; name?: string; error?: string; path?: string }> {
  // Extract extension ID
  const extensionId = extractExtensionId(extensionIdOrUrl);
  if (!extensionId) {
    return { success: false, error: 'Invalid extension ID or URL' };
  }

  const extensionsDir = path.join(app.getPath('userData'), 'extensions');
  const extensionDir = path.join(extensionsDir, extensionId);

  // Check if already installed
  if (fs.existsSync(extensionDir)) {
    const name = getExtensionName(extensionDir);
    return { success: false, error: `Extension "${name}" is already installed` };
  }

  try {
    // Download CRX
    console.log(`[CRX] Downloading extension ${extensionId}...`);
    const crxBuffer = await downloadCrx(extensionId);
    console.log(`[CRX] Downloaded ${crxBuffer.length} bytes`);

    // Extract ZIP from CRX
    const zipBuffer = extractZipFromCrx(crxBuffer);
    console.log(`[CRX] Extracted ZIP: ${zipBuffer.length} bytes`);

    // Create extension directory
    fs.mkdirSync(extensionDir, { recursive: true });

    // Extract ZIP to directory
    await extractZip(zipBuffer, extensionDir);
    console.log(`[CRX] Extracted to ${extensionDir}`);

    // Get extension name
    const name = getExtensionName(extensionDir);

    return { success: true, name, path: extensionDir };
  } catch (error) {
    // Clean up on failure
    if (fs.existsSync(extensionDir)) {
      fs.rmSync(extensionDir, { recursive: true, force: true });
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
