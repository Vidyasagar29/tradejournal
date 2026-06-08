window.TRADE_JOURNAL_CONFIG = window.TRADE_JOURNAL_CONFIG || {
  supabaseUrl: "https://znxgfmixavgfdrisbcnt.supabase.co",
  supabaseAnonKey: "sb_publishable_hK5-s-79O8OjTUSCZQ0rhg__fIcLUJ0",
  connectionTestTable: "portfolio",
  googleSheets: {
    marketDataCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vTT0QXf8Hekn8p7M3HPoBhv_l_35bl781r7xHFAjnAXw3SgLwpCtuj9Uwa8UUYoz4KNfj7C2iE_ITK2/pub?gid=0&single=true&output=csv",
    benchmarkCsvUrl: "",
    columns: {
      symbol: "symbol",
      expiry: "expiry",
      strike: "strike",
      optionType: "option_type",
      iv: "iv",
      niftySpot: "Nifty_50",
      putIv: "PUT_IV",
      callIv: "CALL_IV",
      benchmarkDate: "date",
      benchmarkClose: "close"
    }
  },
  lotSizes: {
    NIFTY: 65,
    BANKNIFTY: 25,
    FINNIFTY: 60
  },
  optionPricing: {
    riskFreeRate: 0.1,
    currentPriceIv: {
      CE: 10,
      PE: 20
    },
    marketCloseTime: {
      hour: 15,
      minute: 30
    }
  }
};
