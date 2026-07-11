import os

def time_to_ms(time_str):
    """Converts SRT timestamp format (HH:MM:SS,mmm) to milliseconds."""
    time_str = time_str.strip()
    h, m, s_ms = time_str.split(':')
    s, ms = s_ms.split(',')
    return int(h) * 3600000 + int(m) * 60000 + int(s) * 1000 + int(ms)

def ms_to_time(ms):
    """Converts milliseconds back to SRT timestamp format (HH:MM:SS,mmm)."""
    ms = int(ms)
    h = ms // 3600000
    ms %= 3600000
    m = ms // 60000
    ms %= 60000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"

def split_srt_words(input_file, output_file):
    """Reads an SRT file, splits sentences into individual words, and calculates new timestamps."""
    
    # Using utf-8-sig to handle files that might have a Byte Order Mark (BOM)
    with open(input_file, 'r', encoding='utf-8-sig') as f:
        content = f.read().strip()
        
    # SRT blocks are separated by double newlines
    blocks = content.split('\n\n')
    new_blocks = []
    new_seq_num = 1
    
    for block in blocks:
        lines = block.split('\n')
        
        # A valid SRT block must have at least an index, timestamp, and text
        if len(lines) < 3:
            continue
            
        times = lines[1]
        if ' --> ' not in times:
            continue
            
        start_str, end_str = times.split(' --> ')
        start_ms = time_to_ms(start_str)
        end_ms = time_to_ms(end_str)
        
        # Combine multiple lines of text within the same block into a single string
        text = " ".join(lines[2:])
        words = text.split()
        
        if not words:
            continue
            
        # Calculate the duration to assign to each word
        num_words = len(words)
        total_duration = end_ms - start_ms
        word_duration = total_duration / num_words
        
        for i, word in enumerate(words):
            # Calculate new start and end times for the individual word
            word_start_ms = start_ms + (i * word_duration)
            word_end_ms = start_ms + ((i + 1) * word_duration)
            
            # Build the new SRT block string
            new_srt_block = (
                f"{new_seq_num}\n"
                f"{ms_to_time(word_start_ms)} --> {ms_to_time(word_end_ms)}\n"
                f"{word}\n"
            )
            
            new_blocks.append(new_srt_block)
            new_seq_num += 1
            
    # Write the newly formatted blocks to the output file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_blocks))
        
    print(f"Successfully processed! Saved to: {output_file}")

# Example Usage
if __name__ == "__main__":
    # Replace these filenames with your actual files
    INPUT_SRT = "input.srt"
    OUTPUT_SRT = "output.srt"
    
    if os.path.exists(INPUT_SRT):
        split_srt_words(INPUT_SRT, OUTPUT_SRT)
    else:
        print(f"Error: The file '{INPUT_SRT}' does not exist in the current directory.")