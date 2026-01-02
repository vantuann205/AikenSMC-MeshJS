//Yêu cầu;
//1. Kiểm tra UTXO required_utxo có được tiêu thụ không
//2. Lấy minted assets dưới policy này
//3. Phải đúng 1 asset duy nhất với quantity = 1 (NFT)
use aiken/collection/dict
use aiken/collection/list
use cardano/assets.{PolicyId, tokens}
use cardano/transaction.{Input, OutputReference, Transaction}
pub type Action {
  Mint
}
validator one_shot_mint(required_utxo: OutputReference) {
  mint(_redeemer: Action, policy_id: PolicyId, tx: Transaction) -> Bool {
    let Transaction { inputs, mint, .. } = tx  
    // 1
    let utxo_consumed = list.any(inputs,fn(input: Input) { input.output_reference == required_utxo })    
    // 2
    let minted_tokens = tokens(mint, policy_id)
    let minted_assets = dict.to_pairs(minted_tokens)    
    // 3
    let exactly_one_nft = when minted_assets is {
      [Pair(_, 1)] -> True
      _            -> False
    }
    utxo_consumed && exactly_one_nft
  }
}