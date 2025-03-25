# README: Hợp đồng Smart Contract trên Cardano  
@Copyright By Tuan Ngo  

Hợp đồng này bao gồm hai ví dụ: **Hello World** và **Vesting**, được triển khai trên Cardano sử dụng **Aiken** (ngôn ngữ smart contract) và **MeshSDK** (TypeScript frontend). Các hợp đồng chạy trên mạng Cardano **Preview** hoặc **Preprod**.

---

## 1. Hợp đồng Smart Contract Hello World  

Smart contract "Hello World" là một hợp đồng Plutus đơn giản với các chức năng sau:  

### 1.1. Tính năng  
- **Khóa (Lock)**:  
  - Người dùng khóa một lượng ADA vào script.  
  - Datum: Khóa công khai băm (`public key hash`) của người khóa.  
- **Mở khóa (Unlock)**:  
  - Người dùng cung cấp redeemer là chuỗi `"Hello, World!"`.  
  - Giao dịch phải được ký bởi khóa tương ứng với `public key hash` trong datum.  

### 1.2. Công nghệ  
- **Aiken**: Viết logic smart contract.  
- **MeshSDK**: Tích hợp frontend để khóa/mở khóa ADA trên mạng Cardano.  
- **Mạng**: Preview hoặc Preprod.  

#### Ví dụ minh họa  
- **Khóa**: Người dùng khóa 10 ADA với `pubKeyHash = "abc123"`.  
- **Mở khóa**: Gửi giao dịch với redeemer `"Hello, World!"` và ký bằng khóa tương ứng với `"abc123"`.  

---

## 2. Hợp đồng Smart Contract Vesting  

Hợp đồng vesting cho phép khóa ADA trong một khoảng thời gian cụ thể với hai điều kiện mở khóa:  
- **Chủ sở hữu (`owner`)**: Rút tiền bất kỳ lúc nào nếu ký giao dịch.  
- **Người thụ hưởng (`beneficiary`)**: Chỉ rút được sau thời gian khóa (`lock_until`) nếu ký giao dịch.  

Dưới đây là giải thích chi tiết về **`ValidityRange`** trong Cardano, cách nó áp dụng vào hợp đồng vesting, và lý do cần cả **`invalidBefore`** (lower bound) và **`invalidHereafter`** (upper bound).  

---

### 2.1. Cơ chế `ValidityRange` trong Cardano  

`ValidityRange` là thuộc tính của giao dịch Cardano, xác định **khoảng thời gian hợp lệ** mà giao dịch được mạng chấp nhận. Nó gồm:  

#### 2.1.1. `lower_bound`  
- **Ý nghĩa**: Thời gian sớm nhất giao dịch có thể được xác nhận (slot hoặc POSIX timestamp).  
- **Kiểu**:  
  - `Finite`: Giá trị cụ thể (ví dụ: slot 5000 hoặc timestamp 1672843961000).  
  - `Unbounded`: Không giới hạn sớm nhất (hợp lệ từ quá khứ).  
- **Vai trò**: Ngăn giao dịch được xác nhận **trước** thời gian này.  

#### 2.1.2. `upper_bound`  
- **Ý nghĩa**: Thời gian muộn nhất giao dịch có thể được xác nhận (slot hoặc POSIX timestamp).  
- **Kiểu**:  
  - `Finite`: Giá trị cụ thể (ví dụ: slot 5100 hoặc timestamp 1672844000000).  
  - `Unbounded`: Không giới hạn muộn nhất (hợp lệ mãi mãi).  
- **Vai trò**: Ngăn giao dịch được xác nhận **sau** thời gian này.  

#### 2.1.3. Cách hoạt động  
- Mạng kiểm tra **slot hiện tại** (1 slot ~ 1 giây trên Preprod) so với `ValidityRange`:  
  - Slot hiện tại < `lower_bound`: Từ chối (quá sớm).  
  - Slot hiện tại > `upper_bound`: Từ chối (quá muộn).  
  - `lower_bound` ≤ Slot hiện tại ≤ `upper_bound`: Chấp nhận.  

##### Ví dụ minh họa  
- Giao dịch:  
  - `lower_bound = Finite(5000)`: Từ slot 5000 trở đi.  
  - `upper_bound = Finite(5100)`: Đến slot 5100.  
- Slot hiện tại:  
  - 4900: Từ chối (trước `lower_bound`).  
  - 5050: Chấp nhận (trong khoảng).  
  - 5200: Từ chối (sau `upper_bound`).  

---

### 2.2. Ứng dụng `ValidityRange` trong Hợp đồng Vesting  

Hợp đồng vesting yêu cầu kiểm soát thời gian để đảm bảo:  
- Chủ sở hữu rút tiền bất kỳ lúc nào.  
- Người thụ hưởng chỉ rút được sau `lock_until`.  

#### 2.2.1. Logic trong Validator (Aiken)  
Validator dùng hàm `valid_after` để kiểm tra thời gian:  

fn valid_after(range: ValidityRange, lock_until) -> Bool {
    when range.upper_bound.bound_type is {
        Finite(tx_earliest_time) -> lock_until <= tx_earliest_time
        _ -> False
    }
} 

#### 2.2.2. Logic trong Frontend (TypeScript)
Trong hàm unlockVesting, ValidityRange được thiết lập bằng:

.invalidBefore(lockUntilSlot): Đặt lower_bound.
.invalidHereafter(currentSlot + 300): Đặt upper_bound.

##### 2.2.2.1. .invalidBefore(lockUntilSlot) (Lower Bound)
Ý nghĩa: Giao dịch không hợp lệ trước slot của lockUntil.
Mục đích:
Ngăn mở khóa sớm trước lockUntil.
Đảm bảo yêu cầu vesting: Tài sản bị khóa đến thời gian chỉ định.
Cách tính:
lockUntil (POSIX ms) -> lockUntilSlot qua unixTimeToEnclosingSlot.
Ví dụ: lockUntil = 1672843961000 -> lockUntilSlot = 5000.
.invalidBefore(5000): Hợp lệ từ slot 5000 trở đi.

##### 2.2.2.2. .invalidHereafter(currentSlot + 300) (Upper Bound)
Ý nghĩa: Giao dịch không hợp lệ sau slot hiện tại + 300 (~5 phút).
Mục đích:
Giới hạn thời gian xử lý, tránh giao dịch treo quá lâu.
Hỗ trợ validator: Cung cấp upper_bound để so sánh với lock_until.
Cách tính:
currentTime = Date.now() -> currentSlot.
Ví dụ: currentTime = 1672844000000 -> currentSlot = 5100.
.invalidHereafter(5100 + 300 = 5400): Hợp lệ đến slot 5400.
Ví dụ tổng hợp
lockUntilSlot = 5000.
currentSlot = 5100.
ValidityRange: [5000, 5400].
Validator: lock_until (5000) <= upper_bound (5400) -> True.

### 2.3. Tại sao cần cả invalidBefore và invalidHereafter?
#### 2.3.1. Vai trò của invalidBefore (Lower Bound)
Bảo vệ logic vesting:
Không có invalidBefore, giao dịch có thể xác nhận trước lockUntil, vi phạm yêu cầu khóa.
Ví dụ: lockUntilSlot = 5000, gửi ở slot 4900 -> Sai logic nếu thiếu invalidBefore.
Hỗ trợ validator: Đảm bảo giao dịch chỉ bắt đầu sau lockUntil.

#### 2.3.2. Vai trò của invalidHereafter (Upper Bound)
Yêu cầu Cardano:
Giao dịch cần upper_bound để mạng biết khi nào từ chối nếu quá hạn.
Không có invalidHereafter, giao dịch treo mãi -> Không thực tế.
Hỗ trợ validator:
valid_after cần upper_bound là Finite để so sánh với lock_until.
Nếu thiếu, upper_bound = Unbounded -> valid_after trả về False.

#### 2.3.3. Sự kết hợp của cả hai
Tạo khoảng hợp lệ:
invalidBefore: Đảm bảo sau lockUntil.
invalidHereafter: Giới hạn thời gian thực tế.
Kết quả: [lockUntilSlot, currentSlot + 300].
Ví dụ:
lockUntilSlot = 5000, currentSlot = 5100.
ValidityRange: [5000, 5400].
Slot hiện tại = 5150 -> Hợp lệ.

#### 2.3.4. Nếu thiếu một trong hai?
Thiếu invalidBefore:
Mở khóa sớm -> Vi phạm vesting.
Thiếu invalidHereafter:
Validator thất bại (upper_bound không xác định).
Giao dịch treo mãi -> Không thực tế.