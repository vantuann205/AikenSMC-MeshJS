use aiken/collection/list          // Nhập module list để sử dụng hàm thao tác với danh sách
use aiken/crypto.{VerificationKeyHash}  // Nhập kiểu VerificationKeyHash để xác định chủ sở hữu
use cardano/transaction.{OutputReference, Transaction}  // Nhập các kiểu liên quan đến giao dịch Cardano

pub type Datum {                   // Định nghĩa kiểu dữ liệu Datum
  owner: VerificationKeyHash,      // Chứa thông tin chủ sở hữu (khóa công khai băm)
}

pub type Redeemer {                // Định nghĩa kiểu dữ liệu Redeemer
  msg: ByteArray,                 // Chứa thông điệp dạng mảng byte
}

validator hello_world {           // Định nghĩa validator tên hello_world
  spend(                         // Hàm kiểm tra khi tiêu thụ (spend) UTXO
    datum_opt: Option<Datum>,    // Dữ liệu đính kèm (có thể có hoặc không)
    redeemer: Redeemer,          // Dữ liệu redeemer chứa thông điệp
    _input: OutputReference,     // Tham chiếu đầu vào (không dùng nên để _)
    tx: Transaction,            // Thông tin giao dịch
  ) {
    expect Some(datum) = datum_opt  // Kiểm tra datum phải tồn tại, gán vào biến datum
    let must_say_hello = redeemer.msg == "Hello, World!"  // Kiểm tra thông điệp phải là "Hello, World!"
    let must_be_signed = list.has(tx.extra_signatories, datum.owner)  // Kiểm tra giao dịch được ký bởi owner
    must_say_hello && must_be_signed  // Cả 2 điều kiện phải đúng để giao dịch hợp lệ
  }

  else(_) {                     // Trường hợp không khớp với hàm spend
    fail                       // Từ chối giao dịch
  }
}