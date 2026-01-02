use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/primitive/bytearray
use cardano/address.{Address}
use cardano/assets.{AssetName, PolicyId, flatten, lovelace_of, without_lovelace}
use cardano/minting
use cardano/transaction.{InlineDatum, Input, Output}
use cardano/tx
use nftcip68/types
use types/cip68.{CIP68}
use validation/find

// check the output utxos containing the reference nft
pub fn check_output_utxo(
  output: Output,
  issuer: VerificationKeyHash,
  vks: List<VerificationKeyHash>,
) -> Bool {
  expect InlineDatum(data) = output.datum
  expect metadatum: CIP68 = data
  // expect name: ByteArray = cip68.get(metadatum, "name")
  // expect image: ByteArray = cip68.get(metadatum, "image")
  // expect media_type: ByteArray = cip68.get(metadatum, "mediaType")
  expect author: VerificationKeyHash = cip68.get(metadatum, types.author_key)
  let output_value =
    output.value
      |> without_lovelace()
      |> flatten()
  and {
    // bytearray.length(name) > 0,
    // bytearray.length(image) > 0,
    // bytearray.length(media_type) > 0,
    author == issuer,
    tx.verify_signature(vks, author),
    list.length(output_value) == 1,
  }
}

// find output with lovelace and address
pub fn find_output(
  outputs: List<Output>,
  price: Int,
  address: Address,
) -> Option<Output> {
  list.find(
    outputs,
    fn(output) {
      lovelace_of(output.value) >= price && output.address.payment_credential == address.payment_credential
    },
  )
}

// check output with lovelace and address
pub fn check_output_remove(
  outputs: List<Output>,
  platform_address: Address,
  platform_fee: Int,
  user_address: Address,
) -> Bool {
  let outputs = list.filter(outputs, fn(output) { or {
          and {
            lovelace_of(output.value) >= platform_fee,
            output.address.payment_credential == platform_address.payment_credential,
          },
          output.address.payment_credential == user_address.payment_credential,
        } })

  list.length(outputs) == 2
}

// check amount output update
pub fn check_output_update(
  inputs: List<Input>,
  outputs: List<Output>,
  address: Address,
) -> Bool {
  let utxo_outputs =
    list.filter(outputs, fn(output) { output.address == address })

  let utxo_inputs =
    list.filter(inputs, fn(input) { input.output.address == address })

  list.length(utxo_outputs) == list.length(utxo_inputs)
}

// filter flatten and return pair of asset names
pub fn filter_and_pair(
  flat: List<(PolicyId, AssetName, Int)>,
  prefix100: ByteArray,
  prefix222: ByteArray,
) -> List<(PolicyId, AssetName, AssetName, Int)> {
  let filter100 =
    list.filter(
      flat,
      fn((_policy_id, asset_name, _amount)) {
        bytearray.starts_with(asset_name, prefix100)
      },
    )
  let filter222 =
    list.filter(
      flat,
      fn((_policy_id, asset_name, _amount)) {
        bytearray.starts_with(asset_name, prefix222)
      },
    )
  let asset_names_amounts100 =
    list.map(
      filter100,
      fn((policy_id, asset_name, amount)) { (policy_id, asset_name, amount) },
    )
  let asset_names_amounts222 =
    list.map(
      filter222,
      fn((policy_id, asset_name, amount)) { (policy_id, asset_name, amount) },
    )

  let sorted100 =
    list.sort(
      asset_names_amounts100,
      fn((_, name1, _), (_, name2, _)) { bytearray.compare(name1, name2) },
    )
  let sorted222 =
    list.sort(
      asset_names_amounts222,
      fn((_, name1, _), (_, name2, _)) { bytearray.compare(name1, name2) },
    )

  let paired = list.zip(sorted100, sorted222)
  list.map(
    paired,
    fn(((policy_id1, name1, amount1), (_policy_id2, name2, amount2))) {
      (policy_id1, name1, name2, amount1 + amount2)
    },
  )
}

// check assets pairs with prefix pairs
pub fn check_assets_prefix(
  flatten: List<(PolicyId, AssetName, Int)>,
  policy_id: PolicyId,
  prefix: ByteArray,
) -> Bool {
  let filtered =
    list.filter(
      flatten,
      fn((_policy_id, asset_name, _amount)) {
        bytearray.starts_with(asset_name, prefix)
      },
    )

  let pairs =
    list.map(
      filtered,
      fn((_policy_id, asset_name, amount)) { (asset_name, -amount) },
    )
  list.foldl(
    pairs,
    True,
    fn((asset_name, amount), acc) {
      if !acc {
        False
      } else {
        and {
          minting.by_prefix(flatten, policy_id, cip68.prefix_222, -amount)?,
          minting.exact(flatten, policy_id, asset_name, -amount)?,
        }
      }
    },
  )
}

// search reference asset exist input
pub fn find_input_reference_asset(
  inputs: List<Input>,
  vks: List<VerificationKeyHash>,
) -> List<(PolicyId, AssetName, Int)> {
  list.filter_map(
    inputs,
    fn(input) {
      when input.output.datum is {
        InlineDatum(data) -> {
          expect metadatum: CIP68 = data
          expect author: VerificationKeyHash =
            cip68.get(metadatum, types.author_key)
          if tx.verify_signature(vks, author) {
            let reference_asset =
              input.output.value
                |> without_lovelace()
                |> assets.flatten()
            let exist =
              list.find(
                reference_asset,
                fn((_policy_id, asset_name, _amount)) {
                  bytearray.starts_with(asset_name, cip68.prefix_100)
                },
              )
            when exist is {
              Some((policy_id, asset_name, amount)) ->
                Some((policy_id, asset_name, amount))
              None -> None
            }
          } else {
            None
          }
        }
        _ -> None
      }
    },
  )
}

// check assets mint
pub fn check_asset_mint(
  flatten: List<(PolicyId, AssetName, Int)>,
  policy_id: PolicyId,
  prefix100: ByteArray,
  prefix222: ByteArray,
  outputs: List<Output>,
  store_address: Address,
  issuer: VerificationKeyHash,
  extra_signatories: List<VerificationKeyHash>,
  has_reference: Bool,
) -> Bool {
  let pairs = filter_and_pair(flatten, prefix100, prefix222)

  list.foldl(
    pairs,
    True,
    fn((_policy_id, reference_asset_name, user_asset_name, amount), acc) {
      if !acc {
        False
      } else {
        let reference_value =
          assets.from_asset(policy_id, reference_asset_name, 1)
        let output_utxo_store =
          find.output_by_addr_value(outputs, store_address, reference_value)
        and {
          check_output_utxo(output_utxo_store, issuer, extra_signatories)?,
          check_pair_asset_name(reference_asset_name, user_asset_name),
          check_minting_reference(
            flatten,
            policy_id,
            reference_asset_name,
            has_reference,
          ),
          minting.exact(flatten, policy_id, user_asset_name, amount - 1)?,
          minting.by_prefix(flatten, policy_id, cip68.prefix_222, amount - 1)?,
        }
      }
    },
  )
}

// check assets burn
pub fn check_asset_burn(
  flatten: List<(PolicyId, AssetName, Int)>,
  policy_id: PolicyId,
  prefix100: ByteArray,
  prefix222: ByteArray,
) -> Bool {
  let pairs = filter_and_pair(flatten, prefix100, prefix222)

  list.foldl(
    pairs,
    True,
    fn((_policy_id, reference_asset_name, user_asset_name, amount), acc) {
      if !acc {
        False
      } else {
        and {
          check_pair_asset_name(reference_asset_name, user_asset_name),
          minting.exact(flatten, policy_id, reference_asset_name, -1)?,
          minting.exact(flatten, policy_id, user_asset_name, amount + 1)?,
          minting.by_prefix(flatten, policy_id, cip68.prefix_100, -1)?,
          minting.by_prefix(flatten, policy_id, cip68.prefix_222, amount + 1)?,
        }
      }
    },
  )
}

// check pair asset name minting
pub fn check_minting_reference(
  flatten: List<(PolicyId, AssetName, Int)>,
  policy_id: PolicyId,
  reference_asset_name: AssetName,
  has_reference: Bool,
) -> Bool {
  if has_reference {
    True
  } else {
    and {
      minting.exact(flatten, policy_id, reference_asset_name, 1)?,
      minting.by_prefix(flatten, policy_id, cip68.prefix_100, 1),
    }
  }
}

// check pair asset name
pub fn check_pair_asset_name(
  reference_asset_name: AssetName,
  user_asset_name: AssetName,
) -> Bool {
  bytearray.compare(
    bytearray.drop(reference_asset_name, 4),
    bytearray.drop(user_asset_name, 4),
  ) == Equal
}

pub fn check_remove_asset(
  inputs: List<Input>,
  extra_signatories: List<VerificationKeyHash>,
) -> Bool {
  let flatten =
    list.filter_map(
      inputs,
      fn(input) {
        when input.output.datum is {
          InlineDatum(data) -> {
            expect metadatum: CIP68 = data
            expect author: VerificationKeyHash =
              cip68.get(metadatum, types.author_key)
            if tx.verify_signature(extra_signatories, author) {
              let reference_asset =
                input.output.value
                  |> without_lovelace()
                  |> assets.flatten()
              let exist =
                list.find(
                  reference_asset,
                  fn((_policy_id, asset_name, _amount)) { or {
                      bytearray.starts_with(asset_name, cip68.prefix_100),
                      bytearray.starts_with(asset_name, cip68.prefix_222),
                    } },
                )

              when exist is {
                Some((policy_id, asset_name, amount)) ->
                  Some((policy_id, asset_name, amount))
                None -> None
              }
            } else {
              None
            }
          }
          _ -> None
        }
      },
    )
  let pairs = filter_and_pair(flatten, cip68.prefix_100, cip68.prefix_222)

  list.foldl(
    pairs,
    True,
    fn((policy_id, reference_asset_name, user_asset_name, amount), acc) {
      if !acc {
        False
      } else {
        and {
          check_pair_asset_name(reference_asset_name, user_asset_name),
          minting.exact(flatten, policy_id, reference_asset_name, -1)?,
          minting.exact(flatten, policy_id, user_asset_name, amount + 1)?,
          minting.by_prefix(flatten, policy_id, cip68.prefix_100, -1)?,
          minting.by_prefix(flatten, policy_id, cip68.prefix_222, amount + 1)?,
        }
      }
    },
  )
}