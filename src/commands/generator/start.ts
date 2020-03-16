/* eslint-disable class-methods-use-this */
/*
 * MIT License
 *
 * Copyright (c) 2020 Decentraliser
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
// external
import { command, metadata, Command } from 'clime'
import { Wallet } from 'symbol-hd-wallets'
import { NetworkType } from 'symbol-sdk'
import prompts from 'prompts'

// internal
import { ExtendedKeysGenerator } from '../../services/ExtendedKeysGenerator'
import { Classifier } from '../../services/Classifier'
import { Results } from '../../services/Results'
import { WordFinder } from '../../services/WordFinder'
import { Match } from '../../model/Match'
import derivationPaths from '../../../assets/paths.json'

const { paths } = derivationPaths

// @TODO: Network type as option
@command({
  description: 'Start the vanity address generator',
})
export default class extends Command {
  @metadata
  async execute() {
    const choices = Object.keys(NetworkType)
      .filter((key) => Number.isNaN(parseFloat(key)))
      .map((word) => ({ title: word, value: word }))

    const questions: any = [
      {
        type: 'select',
        name: 'networkType',
        message: 'Chose a network type',
        choices,
      },
    ]

    const response = await prompts(questions)

    let count = 0

    // instantiate the word finder
    const wordFinder = WordFinder.create()

    // return if word list is empty
    if (!wordFinder.wordList.length) {
      console.info('There are no word to search!')
      console.info('Add some by running the following command:')
      console.info('symbol-vanity words add')
      return
    }

    console.info('Looking for:')
    console.table(wordFinder.wordList)

    // instantiate extended keys generator
    const extendedKeysGenerator = ExtendedKeysGenerator.create()

    // subscribe to extended key stream
    extendedKeysGenerator.extendedKeys$.subscribe(
      ({ extendedKey, mnemonic }) => {
        // @TODO: print time
        count += 1
        if (count === 1) {
          console.info(`
          The generator started
          press CTRL+C to stop the process
        `)
        }
        if (count % 100 === 0) console.info(`${count} derivations performed`)

        // get addresses from the extended key
        const addresses = paths
          .map((path) => new Wallet(extendedKey.derivePath(path)))
          .map((wallet) => wallet.getAccount(NetworkType[response.networkType] as any).address)

        // get matches
        const matches: Match[] = wordFinder.getMatches(addresses.map((address) => address.plain()))
        if (!matches.length) return

        // get matches vanity types and store files
        matches.forEach((match: Match) => {
          const vanityType = Classifier.getVanityType(match)

          console.info('New match!')
          console.table({ ...match, vanityType })

          Results.store(
            extendedKey,
            mnemonic,
            addresses,
            match.word,
            vanityType,
          )
        })
      },
      (error) => console.error(error),
    )

    extendedKeysGenerator.start()
  }
}
