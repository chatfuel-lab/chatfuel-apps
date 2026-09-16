/** One row of a price list the owner pasted or picked. The product's importer is not in this app; the type keeps the logic compiling. */
export interface ImportedService {
  name: string;
  price: number;
  durationMinutes: number;
  currency?: string;
}
