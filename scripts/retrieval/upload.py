from openai import OpenAI
client = OpenAI()
# Create a vector store with a name for the store.
vector_store = client.beta.vector_stores.create(name="CPTCodes")

# Ready the files for upload to the vector store.
file_paths = # /// all files in the folder called finalCPTCodes   they're all called <code>.json

# Using ExitStack to manage multiple context managers and ensure they are properly closed.
with ExitStack() as stack:
    # Open each file in binary read mode and add the file stream to the list
    file_streams = [stack.enter_context(open(path, "rb")) for path in file_paths]

    # Use the upload and poll helper method to upload the files, add them to the vector store,
    # and poll the status of the file batch for completion.
    file_batch = client.beta.vector_stores.file_batches.upload_and_poll(
        vector_store_id=vector_store.id, files=file_streams
    )
