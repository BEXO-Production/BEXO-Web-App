import sys
import os
import struct

def faststart(input_file, output_file):
    print(f"Processing MP4 faststart for: {input_file}")
    with open(input_file, 'rb') as f:
        f.seek(0, os.SEEK_END)
        file_size = f.tell()
        f.seek(0)

        atoms = []
        while f.tell() < file_size:
            pos = f.tell()
            header = f.read(8)
            if len(header) < 8:
                break
            size, atom_type = struct.unpack('>I4s', header)
            atom_type_str = atom_type.decode('latin1')

            if size == 1:
                ext_size = f.read(8)
                size = struct.unpack('>Q', ext_size)[0]
                header_size = 16
            else:
                header_size = 8

            if size == 0:
                # Extends to end of file
                size = file_size - pos

            print(f"Atom: {atom_type_str} at offset {pos}, size {size}")
            atoms.append((atom_type_str, pos, size, header_size))
            f.seek(pos + size)

        # Check if moov is after mdat
        types = [a[0] for a in atoms]
        if 'moov' not in types or 'mdat' not in types:
            print("Error: Missing moov or mdat atom")
            return False

        moov_idx = types.index('moov')
        mdat_idx = types.index('mdat')

        if moov_idx < mdat_idx:
            print("moov is already before mdat! Copying file...")
            with open(input_file, 'rb') as src, open(output_file, 'wb') as dst:
                dst.write(src.read())
            return True

        print("moov is AFTER mdat. Relocating moov to the front (faststart)...")
        moov_atom = atoms[moov_idx]
        mdat_atom = atoms[mdat_idx]

        # Read moov data
        f.seek(moov_atom[1])
        moov_data = bytearray(f.read(moov_atom[2]))

        # Calculate shift
        shift = moov_atom[2]

        # Adjust stco and co64 atoms inside moov_data
        def patch_stco(data, offset_shift):
            i = 0
            patched = 0
            while i < len(data) - 8:
                size, atype = struct.unpack('>I4s', data[i:i+8])
                if atype == b'stco':
                    # stco format: 4-byte size, 4-byte 'stco', 1-byte version, 3-byte flags, 4-byte count, then entries of 4-byte offsets
                    count = struct.unpack('>I', data[i+12:i+16])[0]
                    print(f"Patching stco table with {count} entries (shift +{offset_shift})...")
                    entry_pos = i + 16
                    for _ in range(count):
                        old_off = struct.unpack('>I', data[entry_pos:entry_pos+4])[0]
                        struct.pack_into('>I', data, entry_pos, old_off + offset_shift)
                        entry_pos += 4
                    patched += 1
                elif atype == b'co64':
                    count = struct.unpack('>I', data[i+12:i+16])[0]
                    print(f"Patching co64 table with {count} entries (shift +{offset_shift})...")
                    entry_pos = i + 16
                    for _ in range(count):
                        old_off = struct.unpack('>Q', data[entry_pos:entry_pos+8])[0]
                        struct.pack_into('>Q', data, entry_pos, old_off + offset_shift)
                        entry_pos += 8
                    patched += 1
                i += 1
            print(f"Patched {patched} chunk offset tables.")

        patch_stco(moov_data, shift)

        # Write output file:
        # 1. ftyp (and any atoms before mdat)
        # 2. patched moov
        # 3. mdat (and rest of file)
        with open(output_file, 'wb') as out_f, open(input_file, 'rb') as in_f:
            # Write atoms before mdat (e.g. ftyp)
            for atom in atoms:
                if atom[0] == 'mdat':
                    break
                in_f.seek(atom[1])
                out_f.write(in_f.read(atom[2]))

            # Write patched moov
            out_f.write(moov_data)

            # Write mdat and subsequent atoms (excluding the original moov at the end)
            for atom in atoms:
                if atom[0] in ('ftyp', 'moov'):
                    if atom[0] == 'ftyp':
                        continue # Already written
                    if atom[1] == moov_atom[1]:
                        continue # Skip original moov
                in_f.seek(atom[1])
                # Write in chunks for memory efficiency
                rem = atom[2]
                chunk_size = 10 * 1024 * 1024
                while rem > 0:
                    buf = in_f.read(min(rem, chunk_size))
                    out_f.write(buf)
                    rem -= len(buf)

    print(f"✓ Faststart MP4 successfully created: {output_file}")
    return True

if __name__ == '__main__':
    inp = '/Users/kavin/Documents/BEXO/Bexo-Onboarding-Flow/Background.MP4'
    out = '/Users/kavin/Documents/BEXO/Bexo-Onboarding-Flow/Background_faststart.mp4'
    faststart(inp, out)
