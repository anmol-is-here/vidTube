import { asyncHandler } from "../utils/asyncHandler.js"
import { apiError } from "../utils/apiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary, deleteFromCloudinary} from "../utils/cloudinary.js"
import { apiResponse } from "../utils/apiResponse.js"

const registerUser = asyncHandler( async(req, res) => {
    const {fullname, email, username, password} = req.body

    // validation 
    if(
        [fullname, email, username, password].some((field) =>
        field?.trim() === "")
    ){
        throw new apiError(400, "All fields are required.")
    }

    const existedUser = await User.findOne({
        $or: [{username}, {email}]
    })
    if(existedUser) {
        throw new apiError(409, "User with given username or email already exist.")
    }

    const avatarLocalPath = req.files?.avatar?.[0]?.path
    console.log(avatarLocalPath)
    const coverLocalPath = req.files?.coverImage?.[0]?.path
    console.log(coverLocalPath)
    
    if(!avatarLocalPath){
        throw new apiError(400, "Avatar file is missing")
    }
    // const avatar = await uploadOnCloudinary(avatarLocalPath)
    // let coverImage = ""
    // if(coverLocalPath){
    //     coverImage = await uploadOnCloudinary(coverLocalPath)
    // }

    let avatar;
    try {
        avatar = await uploadOnCloudinary(avatarLocalPath)
        // console.log(avatar)
        console.log(`uploaded avatar ${avatar}`)
    } catch (error) {
        console.log(`Error uploading avatar ${error}`);
        throw new apiError(500, "Failed to upload avatar")
    }

    let coverImage;
    try {
        coverImage = await uploadOnCloudinary(coverLocalPath)
        console.log(`uploaded coverImage ${coverImage}`)
    } catch (error) {
        console.log(`Error uploading coverImage ${error}`);
        throw new apiError(500, "Failed to upload coverImage")
    }

    try {
        const user = await User.create({
            fullname,
            avatar: avatar.url,
            coverImage: coverImage?.url || "",
            email,
            password,
            username: username.toLowerCase()
        })
    
        const createdUser = await User.findById(user._id).select(
            "-password, -refreshToken"
        )
        console.log(createdUser)
        if(!createdUser){
            throw new apiError(500, "something went wrong while registering user")
        }
    
        return res.status(201).json(
            new apiResponse(200, createdUser, "user registered successfully")
        )
    } catch (error) {
        console.log(`User creation falied`);

        // console.log(avatar)
        if(avatar){
            await deleteFromCloudinary(avatar.public_id)
        }
        if(coverImage){
            await deleteFromCloudinary(coverImage.public_id)
        }
        throw new apiError(500, "something went wrong while registering user and images were deleted")
    }
})

export { registerUser }