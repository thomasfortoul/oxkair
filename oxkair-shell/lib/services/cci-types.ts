
export interface CCIEdit {
  column_2: string;
  pre_1996_flag: boolean;
  effective_date: string;
  deletion_date?: string;
  modifier_indicator: "0" | "1" | "2";
  modifier_allowed: string;
  rationale: string;
  source_type: "hospital" | "practitioner";
}

export interface MUEEntry {
  code: string;
  max_units: number;
  adjudication_indicator: string;
  rationale: string;
  service_type: string;
}

export interface GlobalEntry {
  hcpcs: string;
  desc: string;
  global: string;
  status: string;
  globalDescription?: string; 
}
