/** The filesystem holding the office data; available space excludes blocks reserved by the OS. */
export interface DiskUsage {
  total: number;
  used: number;
  available: number;
  percent: number;
}
