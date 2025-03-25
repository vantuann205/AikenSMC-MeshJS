use cardano/transaction.{OutputReference, Transaction, ValidityRange} // Dùng các kiểu dữ liệu giao dịch từ Cardano
use aiken/crypto.{VerificationKeyHash} // Dùng kiểu khóa công khai băm
use aiken/interval.{Finite} // Dùng kiểu Finite để xử lý thời gian cụ thể
use aiken/collection/list // Dùng module list để thao tác danh sách

// Hàm kiểm tra chữ ký
fn key_signed(transaction: Transaction, vk: VerificationKeyHash) -> Bool {
    list.has(transaction.extra_signatories, vk) // Trả về true nếu khóa vk nằm trong danh sách người ký của giao dịch
}

// Hàm kiểm tra thời gian hợp lệ
fn valid_after(range: ValidityRange, lock_until) -> Bool {
    when range.upper_bound.bound_type is { // Xem xét giới hạn trên của khoảng thời gian giao dịch
        Finite(tx_earliest_time) -> lock_until <= tx_earliest_time // Nếu có thời gian cụ thể, kiểm tra lock_until nhỏ hơn hoặc bằng thời gian sớm nhất
        _ -> False // Nếu không có giới hạn cụ thể (vô hạn hoặc khác), trả về False
    }
}

// Định nghĩa kiểu dữ liệu Datum
pub type VestingDatum {
  lock_until: Int, // Thời gian khóa (POSIX milliseconds, ví dụ: 1672843961000)
  owner: VerificationKeyHash, // Khóa công khai băm của chủ sở hữu
  beneficiary: VerificationKeyHash, // Khóa công khai băm của người thụ hưởng
}

// Validator chính
validator vesting {
  spend( // Hàm kiểm tra logic khi tiêu thụ UTXO
    datum_opt: Option<VestingDatum>, // Dữ liệu đính kèm, có thể có hoặc không
    _redeemer: Data, // Redeemer, không dùng nên đặt _
    _input: OutputReference, // Tham chiếu đầu vào, không dùng nên đặt _
    tx: Transaction, // Thông tin giao dịch Cardano
  ) {
    expect Some(datum) = datum_opt // Kiểm tra datum phải tồn tại, nếu không sẽ lỗi, gán giá trị vào datum
    or { // Logic chính: Một trong hai điều kiện sau phải đúng
      key_signed(tx, datum.owner), // Điều kiện 1: Chủ sở hữu ký giao dịch (trả về True nếu đúng)
      and { // Điều kiện 2: Cả hai điều kiện con phải đúng
        key_signed(tx, datum.beneficiary), // Người thụ hưởng phải ký giao dịch
        valid_after(tx.validity_range, datum.lock_until), // Thời gian giao dịch phải sau lock_until
      },
    } // Kết quả: True nếu thỏa mãn một trong hai trường hợp trên
  }
  else(_) { // Nếu không rơi vào trường hợp spend
    fail // Từ chối giao dịch (trả về False)
  }
}