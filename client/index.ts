import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { BridgeCrogecoinSol } from "../target/types/bridge_crogecoin_sol";
const idl = require( "../target/idl/bridge_crogecoin_sol.json");
import {TOKEN_PROGRAM_ID, getOrCreateAssociatedTokenAccount, createMint, mintTo, getAccount, Account, createApproveInstruction, createTransferInstruction} from "@solana/spl-token";
import { PublicKey, Transaction, SYSVAR_INSTRUCTIONS_PUBKEY, ConfirmOptions } from "@solana/web3.js"
const assert = require("assert");
const { SystemProgram } = anchor.web3;

const authority_privkey = [185,126,210,224,216,171,153,149,50,154,146,6,142,70,101,89,199,112,58,29,217,203,26,29,199,224,185,180,119,178,164,116,48,6,212,179,248,36,81,212,57,114,192,79,142,66,129,122,148,232,1,250,233,105,59,163,64,28,74,191,79,197,91,187];
const system_privkey = [82,211,222,11,137,243,201,203,26,223,32,32,250,48,36,182,94,137,245,82,158,79,101,17,72,215,181,97,61,209,148,116,217,62,121,22,168,198,113,207,253,206,196,201,169,150,243,140,40,248,188,73,29,120,34,84,101,158,144,197,45,30,232,158];
const user_privkey = [122,120,232,38,254,94,188,211,79,247,160,114,238,197,40,139,43,158,210,74,89,29,132,36,193,84,149,206,68,249,240,164,169,150,117,70,207,180,9,180,102,197,95,86,127,27,129,12,18,179,218,68,68,248,89,213,40,55,147,210,1,40,11,228];
const governor_privkey= [104,24,124,135,73,200,64,213,225,19,112,200,191,56,7,122,50,227,55,83,115,202,253,169,110,126,202,228,51,0,20,195,39,150,3,198,158,139,73,119,103,109,180,131,98,21,10,94,8,77,127,39,86,99,23,87,69,98,213,69,205,31,226,53];
const swapfee_privkey = [222,120,28,253,96,231,166,184,196,64,3,158,43,71,59,2,135,5,227,61,61,73,45,237,211,203,15,167,68,45,113,81,156,27,87,200,106,187,12,9,77,0,141,20,26,86,69,30,246,59,71,232,138,114,20,207,59,167,137,168,177,77,138,70];
const bridge_privekey = [92,93,78,233,206,111,158,171,153,192,109,139,85,190,16,22,211,155,250,134,205,252,251,96,239,58,142,209,15,238,244,196,178,36,179,63,65,106,48,134,95,5,44,174,243,34,31,17,127,29,213,210,72,53,71,230,217,99,231,237,243,252,164,181];

const authority = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(authority_privkey));
const system_wallet = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(system_privkey));
const user = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(user_privkey));
const governor_wallet = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(governor_privkey));
const swapfee_wallet = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(swapfee_privkey));

//let bridge_account = anchor.web3.Keypair.fromSecretKey(Uint8Array.from(bridge_privekey));
const token_mint = new PublicKey("4aMBz1vwRGPfLvUBMuqrYo9yYVKSbNmLfmfzEAoxpB46");
let bridge_account = {
  publicKey: new PublicKey("ERNRnckqbprNLgE6KXtcoZgvAVVrnM4Jt1DzEBugHmNx"),
}
let user_token_account = new PublicKey("9oM3wtFuLU5rcGYQBRobzzmXeCSsCaQcqfwrruq7Efuq");
let swapfee_token_account = new PublicKey("HGxGixykHUZ4AfJp5iVVvuydtjKqR5yaqK2BeNP9ruvC");

//bridge_account = anchor.web3.Keypair.generate();
//console.log(bridge_account.publicKey.toBase58());

const commitment = 'confirmed'
const connection = new anchor.web3.Connection('https://api.devnet.solana.com', commitment);

const opts: ConfirmOptions = anchor.AnchorProvider.defaultOptions();
opts.preflightCommitment = "confirmed";
opts.commitment = "confirmed";

const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(authority), opts );
anchor.setProvider(provider);

const programID = new PublicKey(idl.metadata.address)
const program = new anchor.Program<BridgeCrogecoinSol>(idl, programID, provider);
let vault_token_account;

const Initialize = async() => {
//   const [_vault_token_account, _bump] = await PublicKey.findProgramAddress(
//       [Buffer.from(anchor.utils.bytes.utf8.encode("CROGE-SPL"))],
//       program.programId
//   );
//   vault_token_account = _vault_token_account;
// try{
//   await program.rpc.initialize({
//     accounts: {
//       bridgeAccount: bridge_account.publicKey,
//       vaultTokenAccount: vault_token_account,
//       authority: authority.publicKey,
//       tokenMint: token_mint,
//       tokenProgram: TOKEN_PROGRAM_ID,
//       systemProgram: SystemProgram.programId,
//       rent: anchor.web3.SYSVAR_RENT_PUBKEY,
//     },
//     instructions: [
//       await program.account.bridgeAccount.createInstruction(bridge_account, 20000),
//     ],
//     signers: [authority, bridge_account]
//   })
// }catch(err) {
//   console.log(err);
// }
}
const SetParams = async() => {
  await program.rpc.setGovernor(
    governor_wallet.publicKey, {
      accounts: {
        bridgeAccount: bridge_account.publicKey,
        authority: authority.publicKey,
      },
      signers: [authority]
  });

  await program.rpc.updateBridgeStatus(
    false, {
      accounts: {
        bridgeAccount: bridge_account.publicKey,
        authority: authority.publicKey,
      },
      signers: [authority]
  })

  await program.rpc.setBridgeFeesAddress(
    swapfee_token_account, {
      accounts: {
        bridgeAccount: bridge_account.publicKey,
        governor: governor_wallet.publicKey,
      },
      signers: [governor_wallet]
  })

  await program.rpc.excludeFromFees(
    user_token_account, 
    false,
    {
      accounts: {
        bridgeAccount: bridge_account.publicKey,
        governor: governor_wallet.publicKey,
      },
      signers: [governor_wallet]
  })
}

const Swap = async(user, user_token_account, swap_amount, to_chain_id, to_eth_address) => {
  const tokenAccountInfo = await getAccount(provider.connection, user_token_account);
    console.log("Before Swapping Token amount of My Account: ", tokenAccountInfo.amount);
    const tokenVaultAccountInfo = await getAccount(provider.connection, vault_token_account);
    console.log("Before Swapping Token amount of Vault Account: ", tokenVaultAccountInfo.amount);
    console.log("Swap Amount: ", swap_amount);
    const user_sol_balance = await provider.connection.getBalance(user.publicKey);
    console.log("Before Swapping Sol balance of My Account: ", user_sol_balance);
    const system_sol_balance = await provider.connection.getBalance(system_wallet.publicKey);
    console.log("Before Swapping Sol balance of System Account: ", system_sol_balance);
    
    console.log("User address: ", user.publicKey.toBase58());

    let swap = program.instruction.swap(
      new anchor.BN(swap_amount),
      to_chain_id,
      to_eth_address,
      {
        accounts: {
          bridgeAccount: bridge_account.publicKey,
          vaultTokenAccount: vault_token_account,
          user: user.publicKey,
          userTokenAccount: user_token_account,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
          system: system_wallet.publicKey,
        }
      }
    )

    try {
      let tx = new Transaction();
      tx.add(swap);
      await provider.sendAndConfirm(tx, [user], {});
    } catch(error) {
      console.log(error);
    }

    const tokenAccountInfoAfterSwap = await getAccount(provider.connection, user_token_account);
    console.log("After Swapping Token amount of My Account: ", tokenAccountInfoAfterSwap.amount);

    const tokenVaultAccountInfoAfterSwap = await getAccount(provider.connection, vault_token_account);
    console.log("After Swapping Token amount of Vault Account: ", tokenVaultAccountInfoAfterSwap.amount);

    const user_sol_balanceAfterSwap = await provider.connection.getBalance(user.publicKey);
    console.log("After Swapping Sol balance of My Account: ", user_sol_balanceAfterSwap);
    const system_sol_balanceAfterSwap = await provider.connection.getBalance(system_wallet.publicKey);
    console.log("After Swapping Sol balance of System Account: ", system_sol_balanceAfterSwap);
}
const SwapBack = async (swapback_amount, from_chain_id, nonce, to) => {
  const tokenAccountInfo = await getAccount(provider.connection, user_token_account);
  console.log("Before SwapBack Token amount of My Account: ", tokenAccountInfo.amount);
  const tokenFeeAccountInfo = await getAccount(provider.connection, swapfee_token_account);
  console.log("Before SwapBack Token amount of SwapFee Account: ", tokenFeeAccountInfo.amount);
  const tokenVaultAccountInfo = await getAccount(provider.connection, vault_token_account);
  console.log("Before SwapBack Token amount of Vault Account: ", tokenVaultAccountInfo.amount);

  console.log("SwapBack Amount: ", swapback_amount);

  // let ix = createApproveInstruction(
  //   user_token_account.address,
  //   vault_token_account,
  //   user.publicKey,
  //   amount,
  // );
  // program.addEventListener()

  let swap_back = program.instruction.swapBack(
    new anchor.BN(swapback_amount),
    nonce,
    from_chain_id,
    {
      accounts: {
        bridgeAccount: bridge_account.publicKey,
        vaultTokenAccount: vault_token_account,
        system: system_wallet.publicKey,
        userTokenAccount:  new PublicKey(to),
        tokenProgram: TOKEN_PROGRAM_ID,
        bridgeFeesAddress: swapfee_token_account,
      }
    }
  )

  try {
    let tx = new Transaction();
    tx.add(swap_back);
    await provider.sendAndConfirm(tx, [system_wallet], {});
  } catch(error) {
    console.log(error);
  }

  const tokenAccountInfoAfterSwap = await getAccount(provider.connection, user_token_account);
  console.log("After SwapBack Token amount of My Account: ", tokenAccountInfoAfterSwap.amount);

  const tokenFeeAccountInfoAfterSwap = await getAccount(provider.connection, swapfee_token_account);
  console.log("After SwapBack Token amount of SwapFee Account: ", tokenFeeAccountInfoAfterSwap.amount);
  
  const tokenVaultAccountInfoAfterSwap = await getAccount(provider.connection, vault_token_account);
  console.log("After SwapBack Token amount of Vault Account: ", tokenVaultAccountInfoAfterSwap.amount);
};


(async() => {
  try {
    const [_vault_token_account, _bump] = await PublicKey.findProgramAddress(
          [Buffer.from(anchor.utils.bytes.utf8.encode("CROGE-SPL"))],
          program.programId
      );
      vault_token_account = _vault_token_account;

   // await Swap(user, user_token_account, 500, 25, "0x063C8512E1f351d49b5535b2a4B0BC77Da98153A");
    await SwapBack(500, 56, new anchor.BN(4783741), user_token_account.toBase58());
    
  }catch(err) {
    console.log(err);
  }
})();
