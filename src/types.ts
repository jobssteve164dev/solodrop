export type DeploymentMode = 'auto' | 'temporary' | 'authenticated';
export type ShareExpiry = 'day' | 'week' | 'month';

export interface ShareOptions {
  allowDownload: boolean;
  watermark: string;
  expiry: ShareExpiry;
}

export interface ArtifactSelection {
  path: string;
  name: string;
  size: number;
  kind: string;
}

export interface ShareRecord {
  id: string;
  name: string;
  sourcePath?: string;
  previewUrl: string;
  originUrl?: string;
  claimUrl?: string;
  managed?: boolean;
  websiteShare?: boolean;
  managementToken?: string;
  clicks?: number;
  temporary: boolean;
  createdAt: string;
  expiresAt?: string;
}

export interface DeploymentResult {
  previewUrl: string;
  claimUrl?: string;
  temporary: boolean;
  output: string;
}
