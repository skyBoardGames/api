interface AccountInfo {
  account_number: string;
  account_name: string;
  bank_id: number;
}

export interface AccountDetails {
  status: boolean;
  message: string;
  data: AccountInfo;
}